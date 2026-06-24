import { Client, type ClientConfig } from 'pg';
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
import { postgresManifest } from './manifest.js';
import { validateReadonlySql, type SqlPolicy } from './sql-validator.js';

interface PgQueryResult {
  rows: Record<string, unknown>[];
  rowCount: number | null;
}

export interface PgClientLike {
  connect(): Promise<unknown>;
  query(sql: string, values?: unknown[]): Promise<PgQueryResult>;
  end(): Promise<void>;
}

export type PgClientFactory = (config: ClientConfig) => PgClientLike;

interface RedactionRule {
  pattern: RegExp;
  replacement: string;
}

interface PostgresSslConfig {
  rejectUnauthorized: boolean;
  caRef?: string;
  servername?: string;
}

interface PostgresConnection extends SqlPolicy {
  host: string;
  port: number;
  database: string;
  usernameRef: string;
  passwordRef: string;
  environment?: string;
  ssl: boolean | PostgresSslConfig;
  maxRows: number;
  statementTimeoutMs: number;
  lockTimeoutMs: number;
  connectTimeoutMs: number;
  redactionRules: RedactionRule[];
}

const DEFAULT_TABLE_DENYLIST = ['pg_*', 'information_schema.*'];
const DEFAULT_REDACTION_PATTERN = /password|passwd|token|secret|api[_-]?key|private[_-]?key|credential/i;

export function createPostgresProviderFactory(): MCPProviderFactory {
  return {
    manifest: postgresManifest,
    create: () => new PostgresProvider()
  };
}

export class PostgresProvider implements MCPProvider {
  name = 'postgres';
  type = 'postgres';
  version = '0.2.0';
  private connections = new Map<string, PostgresConnection>();
  private secretResolver?: SecretResolver;

  constructor(private readonly clientFactory: PgClientFactory = config => new Client(config)) {}

  async initialize(config: ProviderRuntimeConfig): Promise<void> {
    this.secretResolver = config.secretResolver;
    this.connections = parseConnections(config.rawConfig);
  }

  getTools(): MCPToolDefinition[] {
    return postgresManifest.tools;
  }

  async callTool(toolName: string, args: Record<string, unknown>, context: RequestContext): Promise<MCPToolResult> {
    void context;
    if (toolName === 'postgres.list_connections') {
      return trustedServerResult({
        source: 'postgres',
        content: { connections: [...this.connections.keys()].sort() },
        classification: 'INTERNAL'
      });
    }

    const connection = this.getConnection(requiredString(args, 'connection_id'));
    switch (toolName) {
      case 'postgres.list_schemas':
        return this.listSchemas(connection);
      case 'postgres.list_tables':
        return this.listTables(connection, optionalString(args, 'schema', connection.schemasAllowlist[0]));
      case 'postgres.describe_table':
        return this.describeTable(
          connection,
          optionalString(args, 'schema', connection.schemasAllowlist[0]),
          requiredString(args, 'table')
        );
      case 'postgres.query_readonly':
        return this.queryReadonly(connection, args);
      case 'postgres.explain_query':
        return this.explainQuery(connection, args);
      default:
        throw new Error(`Unsupported postgres tool: ${toolName}`);
    }
  }

  private async listSchemas(connection: PostgresConnection): Promise<MCPToolResult> {
    const result = await this.withReadonlyClient(connection, client => client.query(
      `SELECT schema_name
         FROM information_schema.schemata
        WHERE schema_name = ANY($1::text[])
        ORDER BY schema_name`,
      [connection.schemasAllowlist]
    ));
    return taintedExternalResult({
      source: 'postgres',
      content: { schemas: result.rows.map(row => String(row.schema_name)) },
      classification: 'INTERNAL'
    });
  }

  private async listTables(connection: PostgresConnection, schema: string): Promise<MCPToolResult> {
    assertSchemaAllowed(connection, schema);
    const result = await this.withReadonlyClient(connection, client => client.query(
      `SELECT table_schema AS schema, table_name AS name, table_type AS type
         FROM information_schema.tables
        WHERE table_schema = $1
        ORDER BY table_name`,
      [schema]
    ));
    const tables = result.rows
      .map(row => ({ schema: String(row.schema), name: String(row.name), type: String(row.type) }))
      .filter(row => isTableAllowed(connection, row.schema, row.name));
    return taintedExternalResult({ source: 'postgres', content: { tables }, classification: 'INTERNAL' });
  }

  private async describeTable(connection: PostgresConnection, schema: string, table: string): Promise<MCPToolResult> {
    assertSchemaAllowed(connection, schema);
    assertTableAllowed(connection, schema, table);
    const [columns, indexes] = await this.withReadonlyClient(connection, async client => {
      const columnResult = await client.query(
        `SELECT column_name AS name,
                data_type,
                udt_name,
                is_nullable = 'YES' AS nullable,
                column_default AS default_value,
                ordinal_position
           FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          ORDER BY ordinal_position`,
        [schema, table]
      );
      const indexResult = await client.query(
        `SELECT indexname AS name, indexdef AS definition, tablespace
           FROM pg_indexes
          WHERE schemaname = $1 AND tablename = $2
          ORDER BY indexname`,
        [schema, table]
      );
      return [columnResult.rows, indexResult.rows];
    });
    return taintedExternalResult({
      source: 'postgres',
      content: { columns, indexes },
      classification: 'INTERNAL'
    });
  }

  private async queryReadonly(connection: PostgresConnection, args: Record<string, unknown>): Promise<MCPToolResult> {
    const parameters = optionalArray(args, 'parameters');
    const analysis = validateReadonlySql(args.sql, parameters, connection);
    const maxRows = Math.min(optionalPositiveInteger(args, 'max_rows', connection.maxRows), connection.maxRows);
    const limitParameter = analysis.parameterCount + 1;
    const wrappedSql = `SELECT * FROM (${analysis.normalizedSql}) AS mcp_readonly_query LIMIT $${limitParameter}`;
    const result = await this.withReadonlyClient(connection, client => client.query(
      wrappedSql,
      [...parameters, maxRows + 1]
    ));
    const truncated = result.rows.length > maxRows;
    const rows = result.rows.slice(0, maxRows).map(row => redactRow(row, connection.redactionRules));
    return taintedExternalResult({
      source: 'postgres',
      content: { rows, row_count: rows.length, truncated },
      classification: 'CONFIDENTIAL'
    });
  }

  private async explainQuery(connection: PostgresConnection, args: Record<string, unknown>): Promise<MCPToolResult> {
    const parameters = optionalArray(args, 'parameters');
    const analysis = validateReadonlySql(args.sql, parameters, connection);
    const result = await this.withReadonlyClient(connection, client => client.query(
      `EXPLAIN (FORMAT JSON, ANALYZE FALSE, VERBOSE FALSE, COSTS TRUE) ${analysis.normalizedSql}`,
      parameters
    ));
    return taintedExternalResult({
      source: 'postgres',
      content: { plan: result.rows[0]?.['QUERY PLAN'] ?? [] },
      classification: 'INTERNAL'
    });
  }

  private async withReadonlyClient<T>(
    connection: PostgresConnection,
    operation: (client: PgClientLike) => Promise<T>
  ): Promise<T> {
    const client = this.clientFactory(await this.buildClientConfig(connection));
    let transactionStarted = false;
    try {
      await client.connect();
      await client.query('BEGIN TRANSACTION READ ONLY');
      transactionStarted = true;
      await client.query(`SET LOCAL statement_timeout = ${connection.statementTimeoutMs}`);
      await client.query(`SET LOCAL lock_timeout = ${connection.lockTimeoutMs}`);
      await client.query(`SET LOCAL idle_in_transaction_session_timeout = ${connection.statementTimeoutMs + 5000}`);
      await client.query(`SET LOCAL search_path TO ${connection.schemasAllowlist.map(quoteIdentifier).join(', ')}`);
      const readonly = await client.query("SELECT current_setting('transaction_read_only') AS value");
      if (readonly.rows[0]?.value !== 'on') throw new Error('PostgreSQL transaction is not read-only.');
      return await operation(client);
    } finally {
      if (transactionStarted) {
        try { await client.query('ROLLBACK'); } catch { /* Preserve the original error. */ }
      }
      await client.end();
    }
  }

  private async buildClientConfig(connection: PostgresConnection): Promise<ClientConfig> {
    if (!this.secretResolver) throw new Error('Postgres provider is not initialized.');
    const [username, password] = await Promise.all([
      this.secretResolver.resolve(connection.usernameRef),
      this.secretResolver.resolve(connection.passwordRef)
    ]);
    let ssl: ClientConfig['ssl'] = connection.ssl;
    if (typeof connection.ssl === 'object') {
      const ca = connection.ssl.caRef
        ? (await this.secretResolver.resolve(connection.ssl.caRef)).revealToProviderOnly()
        : undefined;
      ssl = {
        rejectUnauthorized: connection.ssl.rejectUnauthorized,
        ca,
        servername: connection.ssl.servername
      };
    }
    return {
      host: connection.host,
      port: connection.port,
      database: connection.database,
      user: username.revealToProviderOnly(),
      password: password.revealToProviderOnly(),
      ssl,
      connectionTimeoutMillis: connection.connectTimeoutMs,
      application_name: 'mcp-all-in-one'
    };
  }

  private getConnection(connectionId: string): PostgresConnection {
    const connection = this.connections.get(connectionId);
    if (!connection) throw new Error(`Unknown PostgreSQL connection: ${connectionId}`);
    return connection;
  }
}

function parseConnections(rawConfig: Record<string, unknown>): Map<string, PostgresConnection> {
  if (!isRecord(rawConfig.connections)) throw new Error('Postgres config requires a connections object.');
  const connections = new Map<string, PostgresConnection>();
  for (const [connectionId, raw] of Object.entries(rawConfig.connections)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(connectionId)) throw new Error(`Invalid PostgreSQL connection ID: ${connectionId}`);
    if (!isRecord(raw)) throw new Error(`Invalid PostgreSQL connection config: ${connectionId}`);
    if (raw.readonly !== true) throw new Error(`PostgreSQL connection ${connectionId} must set readonly: true.`);
    const schemasAllowlist = stringArray(raw.schemas_allowlist, ['public']);
    if (!schemasAllowlist.length) throw new Error(`PostgreSQL connection ${connectionId} requires schemas_allowlist.`);
    connections.set(connectionId, {
      host: requiredString(raw, 'host'),
      port: boundedInteger(raw.port, 5432, 1, 65535),
      database: requiredString(raw, 'database'),
      usernameRef: requiredString(raw, 'username_ref'),
      passwordRef: requiredString(raw, 'password_ref'),
      environment: typeof raw.environment === 'string' ? raw.environment : undefined,
      ssl: parseSsl(raw.ssl),
      maxRows: boundedInteger(raw.max_rows, 100, 1, 10000),
      maxQueryLength: boundedInteger(raw.max_query_length, 50000, 1, 1000000),
      statementTimeoutMs: boundedInteger(raw.statement_timeout_ms, 5000, 100, 120000),
      lockTimeoutMs: boundedInteger(raw.lock_timeout_ms, 1000, 1, 30000),
      connectTimeoutMs: boundedInteger(raw.connect_timeout_ms, 5000, 100, 60000),
      schemasAllowlist,
      tableAllowlist: stringArray(raw.table_allowlist),
      tableDenylist: [...DEFAULT_TABLE_DENYLIST, ...stringArray(raw.table_denylist)],
      columnDenylist: stringArray(raw.column_denylist),
      blockedFunctions: stringArray(raw.blocked_functions),
      redactionRules: parseRedactionRules(raw.column_redaction)
    });
  }
  return connections;
}

function parseSsl(value: unknown): boolean | PostgresSslConfig {
  if (value === undefined || value === false) return false;
  if (value === true) return true;
  if (!isRecord(value)) throw new Error('ssl must be a boolean or object.');
  return {
    rejectUnauthorized: value.reject_unauthorized !== false,
    caRef: typeof value.ca_ref === 'string' ? value.ca_ref : undefined,
    servername: typeof value.servername === 'string' ? value.servername : undefined
  };
}

function parseRedactionRules(value: unknown): RedactionRule[] {
  const rules: RedactionRule[] = [{ pattern: DEFAULT_REDACTION_PATTERN, replacement: '[REDACTED]' }];
  if (value === undefined) return rules;
  if (!Array.isArray(value)) throw new Error('column_redaction must be an array.');
  for (const item of value) {
    if (!isRecord(item) || typeof item.pattern !== 'string' || typeof item.replacement !== 'string') {
      throw new Error('Invalid column_redaction rule.');
    }
    const insensitive = item.pattern.startsWith('(?i)');
    const source = insensitive ? item.pattern.slice(4) : item.pattern;
    try {
      rules.push({ pattern: new RegExp(source, insensitive ? 'i' : undefined), replacement: item.replacement });
    } catch {
      throw new Error(`Invalid column_redaction pattern: ${item.pattern}`);
    }
  }
  return rules;
}

function redactRow(row: Record<string, unknown>, rules: RedactionRule[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([column, value]) => {
    const rule = rules.find(candidate => candidate.pattern.test(column));
    return [column, rule ? rule.replacement : value];
  }));
}

function assertSchemaAllowed(connection: PostgresConnection, schema: string): void {
  if (!connection.schemasAllowlist.some(item => item.toLowerCase() === schema.toLowerCase())) {
    throw new Error(`Schema is not allowlisted: ${schema}`);
  }
}

function assertTableAllowed(connection: PostgresConnection, schema: string, table: string): void {
  if (!isTableAllowed(connection, schema, table)) throw new Error(`Table is not allowed: ${schema}.${table}`);
}

function isTableAllowed(connection: PostgresConnection, schema: string, table: string): boolean {
  const qualified = `${schema}.${table}`;
  if (matchesAny(qualified, connection.tableDenylist) || matchesAny(table, connection.tableDenylist)) return false;
  return !connection.tableAllowlist.length ||
    matchesAny(qualified, connection.tableAllowlist) || matchesAny(table, connection.tableAllowlist);
}

function matchesAny(value: string, patterns: string[]): boolean {
  return patterns.some(pattern => {
    const expression = pattern.toLowerCase().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${expression}$`, 'i').test(value.toLowerCase());
  });
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const result = value[key];
  if (typeof result !== 'string' || !result.trim()) throw new Error(`${key} must be a non-empty string.`);
  return result.trim();
}

function optionalString(value: Record<string, unknown>, key: string, fallback: string): string {
  if (value[key] === undefined) return fallback;
  return requiredString(value, key);
}

function optionalArray(value: Record<string, unknown>, key: string): unknown[] {
  const result = value[key];
  if (result === undefined) return [];
  if (!Array.isArray(result)) throw new Error(`${key} must be an array.`);
  return result;
}

function optionalPositiveInteger(value: Record<string, unknown>, key: string, fallback: number): number {
  if (value[key] === undefined) return fallback;
  return boundedInteger(value[key], fallback, 1, 10000);
}

function stringArray(value: unknown, fallback: string[] = []): string[] {
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) {
    throw new Error('Expected an array of non-empty strings.');
  }
  return [...new Set(value.map(item => String(item).trim()))];
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
