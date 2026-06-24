import type {
  MCPProvider,
  MCPProviderFactory,
  MCPToolDefinition,
  MCPToolResult,
  ProviderRuntimeConfig,
  RequestContext,
  SecretResolver
} from '../../core/provider/types.js';
import { taintedExternalResult, trustedServerResult } from '../../core/security/taint.js';
import { redashManifest } from './manifest.js';

type ApiMode = 'auto' | 'results' | 'legacy_refresh';

interface RedashConnection {
  baseUrl: string;
  apiKeyRef: string;
  queryAllowlist: Set<number> | '*';
  maxRows: number;
  maxWaitSeconds: number;
  requestTimeoutMs: number;
  refreshEnabled: boolean;
  cachedFallbackEnabled: boolean;
  apiMode: ApiMode;
}

interface RedashResponse {
  query_result?: QueryResult;
  job?: RedashJob;
  query?: Record<string, unknown>;
  [key: string]: unknown;
}

interface QueryResult {
  data?: { rows?: unknown[] };
}

interface RedashJob {
  id?: string | number;
  status?: number;
  query_result_id?: string | number;
}

class RedashHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function createRedashProviderFactory(): MCPProviderFactory {
  return {
    manifest: redashManifest,
    create: () => new RedashProvider()
  };
}

export class RedashProvider implements MCPProvider {
  name = 'redash';
  type = 'redash';
  version = '0.1.0';
  private connections = new Map<string, RedashConnection>();
  private secretResolver?: SecretResolver;

  async initialize(config: ProviderRuntimeConfig): Promise<void> {
    this.secretResolver = config.secretResolver;
    this.connections = parseConnections(config.rawConfig);
  }

  getTools(): MCPToolDefinition[] {
    return redashManifest.tools;
  }

  async callTool(toolName: string, args: Record<string, unknown>, context: RequestContext): Promise<MCPToolResult> {
    void context;

    if (toolName === 'redash.list_connections') {
      return trustedServerResult({
        source: 'redash',
        content: { connections: [...this.connections.keys()].sort() },
        classification: 'INTERNAL'
      });
    }

    const connection = this.getConnection(requiredString(args, 'connection_id'));
    const queryId = requiredPositiveInteger(args, 'query_id');
    assertQueryAllowed(connection, queryId);

    switch (toolName) {
      case 'redash.get_query': {
        const payload = await this.request(connection, `/api/queries/${queryId}`);
        const query = isRecord(payload.query) ? payload.query : payload;
        return taintedExternalResult({ source: 'redash', content: { query }, classification: 'INTERNAL' });
      }
      case 'redash.get_cached_query_results': {
        const rows = await this.fetchCached(connection, queryId);
        return this.rowsResult(rows, connection, args, true);
      }
      case 'redash.fetch_query_results':
        return this.fetchQueryResults(connection, queryId, args);
      default:
        throw new Error(`Unsupported redash tool: ${toolName}`);
    }
  }

  private async fetchQueryResults(
    connection: RedashConnection,
    queryId: number,
    args: Record<string, unknown>
  ): Promise<MCPToolResult> {
    const refresh = optionalBoolean(args, 'refresh', true);
    if (!refresh) {
      const rows = await this.fetchCached(connection, queryId);
      return this.rowsResult(rows, connection, args, true);
    }
    if (!connection.refreshEnabled) {
      throw new Error('Redash refresh is disabled for this connection. Set refresh=false to read cached results.');
    }

    const parameters = optionalRecord(args, 'parameters');
    const maxAge = optionalNonNegativeInteger(args, 'max_age', 0);
    const maxWaitSeconds = Math.min(
      optionalPositiveInteger(args, 'max_wait_seconds', connection.maxWaitSeconds),
      connection.maxWaitSeconds
    );

    try {
      const payload = await this.triggerRefresh(connection, queryId, parameters, maxAge);
      const rows = await this.rowsFromRefreshResponse(connection, queryId, payload, maxWaitSeconds);
      return this.rowsResult(rows, connection, args, false);
    } catch (error) {
      if (error instanceof RedashHttpError && error.status === 403 && connection.cachedFallbackEnabled) {
        const rows = await this.fetchCached(connection, queryId);
        return this.rowsResult(rows, connection, args, true, [
          'Refresh was forbidden; cached results were returned and requested parameters may not be applied.'
        ]);
      }
      throw error;
    }
  }

  private async triggerRefresh(
    connection: RedashConnection,
    queryId: number,
    parameters: Record<string, unknown>,
    maxAge: number
  ): Promise<RedashResponse> {
    if (connection.apiMode !== 'legacy_refresh') {
      try {
        return await this.request(connection, `/api/queries/${queryId}/results`, {
          method: 'POST',
          body: JSON.stringify({ parameters, max_age: maxAge })
        });
      } catch (error) {
        if (connection.apiMode !== 'auto' || !(error instanceof RedashHttpError) || error.status !== 404) throw error;
      }
    }

    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(parameters)) search.set(`p_${key}`, String(value));
    const suffix = search.size ? `?${search.toString()}` : '';
    return this.request(connection, `/api/queries/${queryId}/refresh${suffix}`, { method: 'POST' });
  }

  private async rowsFromRefreshResponse(
    connection: RedashConnection,
    queryId: number,
    payload: RedashResponse,
    maxWaitSeconds: number
  ): Promise<unknown[]> {
    const direct = extractRows(payload);
    if (direct) return direct;

    const job = payload.job;
    if (job?.id !== undefined) return this.pollJob(connection, String(job.id), maxWaitSeconds);
    return this.fetchCached(connection, queryId);
  }

  private async pollJob(connection: RedashConnection, jobId: string, maxWaitSeconds: number): Promise<unknown[]> {
    const deadline = Date.now() + maxWaitSeconds * 1000;
    while (Date.now() < deadline) {
      const payload = await this.request(connection, `/api/jobs/${encodeURIComponent(jobId)}`);
      const job = payload.job;
      if (!job) throw new Error('Redash job response did not contain a job object.');
      if (job.status === 3) {
        if (job.query_result_id === undefined) throw new Error('Successful Redash job did not contain query_result_id.');
        const result = await this.request(connection, `/api/query_results/${encodeURIComponent(String(job.query_result_id))}.json`);
        return requireRows(result);
      }
      if (job.status === 4) throw new Error('Redash query failed.');
      if (job.status === 5) throw new Error('Redash query was cancelled.');
      await delay(Math.min(2000, Math.max(0, deadline - Date.now())));
    }
    throw new Error(`Redash query timed out after ${maxWaitSeconds}s.`);
  }

  private async fetchCached(connection: RedashConnection, queryId: number): Promise<unknown[]> {
    const payload = await this.request(connection, `/api/queries/${queryId}/results.json`);
    return requireRows(payload);
  }

  private rowsResult(
    rows: unknown[],
    connection: RedashConnection,
    args: Record<string, unknown>,
    cached: boolean,
    warnings?: string[]
  ): MCPToolResult {
    const requestedMaxRows = optionalPositiveInteger(args, 'max_rows', connection.maxRows);
    const maxRows = Math.min(requestedMaxRows, connection.maxRows);
    const safeRows = rows.filter(isRecord);
    const returnedRows = safeRows.slice(0, maxRows);
    return taintedExternalResult({
      source: 'redash',
      classification: 'CONFIDENTIAL',
      warnings,
      content: {
        rows: returnedRows,
        row_count: safeRows.length,
        returned_row_count: returnedRows.length,
        truncated: safeRows.length > returnedRows.length,
        cached
      }
    });
  }

  private async request(connection: RedashConnection, path: string, init: RequestInit = {}): Promise<RedashResponse> {
    if (!this.secretResolver) throw new Error('Redash provider is not initialized.');
    const apiKey = (await this.secretResolver.resolve(connection.apiKeyRef)).revealToProviderOnly();
    const url = new URL(`${connection.baseUrl}/${path.replace(/^\//, '')}`);
    const response = await fetch(url, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(connection.requestTimeoutMs),
      headers: {
        Accept: 'application/json',
        Authorization: `Key ${apiKey}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {})
      }
    });
    if (!response.ok) throw new RedashHttpError(response.status, `Redash API request failed with HTTP ${response.status}.`);
    const payload: unknown = await response.json();
    if (!isRecord(payload)) throw new Error('Redash API returned a non-object JSON response.');
    return payload as RedashResponse;
  }

  private getConnection(connectionId: string): RedashConnection {
    const connection = this.connections.get(connectionId);
    if (!connection) throw new Error(`Unknown Redash connection: ${connectionId}`);
    return connection;
  }
}

function parseConnections(rawConfig: Record<string, unknown>): Map<string, RedashConnection> {
  if (!isRecord(rawConfig.connections)) throw new Error('Redash config requires a connections object.');
  const result = new Map<string, RedashConnection>();
  for (const [connectionId, raw] of Object.entries(rawConfig.connections)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(connectionId)) throw new Error(`Invalid Redash connection ID: ${connectionId}`);
    if (!isRecord(raw)) throw new Error(`Invalid Redash connection config: ${connectionId}`);
    const parsedUrl = new URL(requiredString(raw, 'base_url'));
    if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
      throw new Error(`Redash connection ${connectionId} requires an http(s) base_url without credentials.`);
    }
    const allowlist = raw.query_allowlist;
    if (!Array.isArray(allowlist)) throw new Error(`Redash connection ${connectionId} requires query_allowlist.`);
    const wildcard = allowlist.includes('*');
    const ids = allowlist.map(Number).filter((value) => Number.isSafeInteger(value) && value > 0);
    const apiMode = raw.api_mode ?? 'auto';
    if (!['auto', 'results', 'legacy_refresh'].includes(String(apiMode))) {
      throw new Error(`Invalid Redash api_mode for connection ${connectionId}.`);
    }
    result.set(connectionId, {
      baseUrl: parsedUrl.toString().replace(/\/$/, ''),
      apiKeyRef: requiredString(raw, 'api_key_ref'),
      queryAllowlist: wildcard ? '*' : new Set(ids),
      maxRows: boundedInteger(raw.max_rows, 500, 1, 10000),
      maxWaitSeconds: boundedInteger(raw.max_wait_seconds, 120, 1, 600),
      requestTimeoutMs: boundedInteger(raw.request_timeout_ms, 15000, 100, 120000),
      refreshEnabled: raw.refresh_enabled !== false,
      cachedFallbackEnabled: raw.cached_fallback_enabled !== false,
      apiMode: apiMode as ApiMode
    });
  }
  return result;
}

function assertQueryAllowed(connection: RedashConnection, queryId: number): void {
  if (connection.queryAllowlist !== '*' && !connection.queryAllowlist.has(queryId)) {
    throw new Error(`Redash query ${queryId} is not in the connection allowlist.`);
  }
}

function extractRows(payload: RedashResponse): unknown[] | undefined {
  const rows = payload.query_result?.data?.rows;
  return Array.isArray(rows) ? rows : undefined;
}

function requireRows(payload: RedashResponse): unknown[] {
  const rows = extractRows(payload);
  if (!rows) throw new Error('Redash response did not contain query_result.data.rows.');
  return rows;
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const result = value[key];
  if (typeof result !== 'string' || !result.trim()) throw new Error(`${key} must be a non-empty string.`);
  return result.trim();
}

function requiredPositiveInteger(value: Record<string, unknown>, key: string): number {
  const result = value[key];
  if (!Number.isSafeInteger(result) || Number(result) < 1) throw new Error(`${key} must be a positive integer.`);
  return Number(result);
}

function optionalPositiveInteger(value: Record<string, unknown>, key: string, fallback: number): number {
  if (value[key] === undefined) return fallback;
  return requiredPositiveInteger(value, key);
}

function optionalNonNegativeInteger(value: Record<string, unknown>, key: string, fallback: number): number {
  const result = value[key];
  if (result === undefined) return fallback;
  if (!Number.isSafeInteger(result) || Number(result) < 0) throw new Error(`${key} must be a non-negative integer.`);
  return Number(result);
}

function optionalBoolean(value: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const result = value[key];
  if (result === undefined) return fallback;
  if (typeof result !== 'boolean') throw new Error(`${key} must be a boolean.`);
  return result;
}

function optionalRecord(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const result = value[key];
  if (result === undefined) return {};
  if (!isRecord(result)) throw new Error(`${key} must be an object.`);
  return result;
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`Expected an integer between ${minimum} and ${maximum}.`);
  }
  return Number(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
