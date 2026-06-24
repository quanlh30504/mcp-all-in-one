import type { MCPProvider, MCPProviderFactory, MCPToolDefinition, MCPToolResult, ProviderRuntimeConfig, RequestContext } from '../../core/provider/types.js';
import { taintedExternalResult, trustedServerResult } from '../../core/security/taint.js';
import { postgresManifest } from './manifest.js';

export function createPostgresProviderFactory(): MCPProviderFactory {
  return {
    manifest: postgresManifest,
    create: () => new PostgresProvider()
  };
}

class PostgresProvider implements MCPProvider {
  name = 'postgres';
  type = 'postgres';
  version = '0.1.0';
  private config?: ProviderRuntimeConfig;

  async initialize(config: ProviderRuntimeConfig): Promise<void> {
    this.config = config;
  }

  getTools(): MCPToolDefinition[] {
    return postgresManifest.tools;
  }

  async callTool(toolName: string, args: Record<string, unknown>, context: RequestContext): Promise<MCPToolResult> {
    void context;
    switch (toolName) {
      case 'postgres.list_connections':
        return trustedServerResult({ source: 'postgres', content: { connections: [] }, classification: 'INTERNAL' });
      case 'postgres.list_schemas':
      case 'postgres.list_tables':
      case 'postgres.describe_table':
      case 'postgres.explain_query':
        // TODO: resolve connection secrets at execution time only, then call pg client.
        return taintedExternalResult({ source: 'postgres', content: { todo: toolName, args: safeArgs(args) }, classification: 'INTERNAL' });
      case 'postgres.query_readonly':
        // TODO: enforce SQL parser, LIMIT, statement_timeout, denylist, redaction, max_rows.
        return taintedExternalResult({ source: 'postgres', content: { rows: [], row_count: 0, truncated: false }, classification: 'CONFIDENTIAL' });
      default:
        throw new Error(`Unsupported postgres tool: ${toolName}`);
    }
  }
}

function safeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const clone = { ...args };
  delete clone.password;
  delete clone.token;
  delete clone.secret;
  return clone;
}
