import type { MCPToolDefinition } from '../../core/provider/types.js';

const connectionId = { type: 'string', minLength: 1 };
const schema = { type: 'string', minLength: 1 };
const table = { type: 'string', minLength: 1 };

export const postgresTools: MCPToolDefinition[] = [
  {
    name: 'postgres.list_connections',
    description: 'List configured PostgreSQL connection IDs. Hosts, databases, usernames, passwords and connection strings are never returned.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    outputSchema: {
      type: 'object',
      properties: { connections: { type: 'array', items: { type: 'string' } } },
      required: ['connections']
    },
    permission: { provider: 'postgres', action: 'read:metadata' },
    riskLevel: 'LOW',
    timeoutMs: 2000,
    retry: { maxAttempts: 0 },
    outputClassification: 'INTERNAL'
  },
  {
    name: 'postgres.list_schemas',
    description: 'List allowlisted schemas for a PostgreSQL connection.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['connection_id'],
      properties: { connection_id: connectionId }
    },
    outputSchema: {
      type: 'object',
      properties: { schemas: { type: 'array', items: { type: 'string' } } },
      required: ['schemas']
    },
    permission: { provider: 'postgres', action: 'read:metadata', requiresConnection: true },
    riskLevel: 'LOW', timeoutMs: 10000, retry: { maxAttempts: 0 }, outputClassification: 'INTERNAL'
  },
  {
    name: 'postgres.list_tables',
    description: 'List visible, allowlisted PostgreSQL tables and views in one schema.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['connection_id'],
      properties: { connection_id: connectionId, schema }
    },
    outputSchema: {
      type: 'object',
      properties: {
        tables: {
          type: 'array',
          items: {
            type: 'object',
            properties: { schema: { type: 'string' }, name: { type: 'string' }, type: { type: 'string' } },
            required: ['schema', 'name', 'type']
          }
        }
      },
      required: ['tables']
    },
    permission: { provider: 'postgres', action: 'read:metadata', requiresConnection: true },
    riskLevel: 'LOW', timeoutMs: 10000, retry: { maxAttempts: 0 }, outputClassification: 'INTERNAL'
  },
  {
    name: 'postgres.describe_table',
    description: 'Describe columns and indexes for one allowlisted PostgreSQL table or view.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['connection_id', 'table'],
      properties: { connection_id: connectionId, schema, table }
    },
    outputSchema: {
      type: 'object',
      properties: {
        columns: { type: 'array', items: { type: 'object' } },
        indexes: { type: 'array', items: { type: 'object' } }
      },
      required: ['columns', 'indexes']
    },
    permission: { provider: 'postgres', action: 'read:metadata', requiresConnection: true },
    riskLevel: 'LOW', timeoutMs: 10000, retry: { maxAttempts: 0 }, outputClassification: 'INTERNAL'
  },
  {
    name: 'postgres.query_readonly',
    description: 'Run one AST-validated SELECT/WITH query in a PostgreSQL READ ONLY transaction. Row limits, timeouts, schema/table policies and sensitive-column redaction are enforced server-side.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['connection_id', 'sql'],
      properties: {
        connection_id: connectionId,
        sql: { type: 'string', minLength: 1 },
        parameters: { type: 'array' },
        max_rows: { type: 'integer', minimum: 1, maximum: 10000 }
      }
    },
    outputSchema: {
      type: 'object',
      properties: {
        rows: { type: 'array', items: { type: 'object' } },
        row_count: { type: 'integer' },
        truncated: { type: 'boolean' }
      },
      required: ['rows', 'row_count', 'truncated']
    },
    permission: { provider: 'postgres', action: 'read:data', requiresConnection: true },
    riskLevel: 'MEDIUM', timeoutMs: 120000, retry: { maxAttempts: 0 },
    rateLimit: { requests: 30, windowSeconds: 60 }, outputClassification: 'CONFIDENTIAL'
  },
  {
    name: 'postgres.explain_query',
    description: 'Run EXPLAIN FORMAT JSON without ANALYZE for one AST-validated read-only PostgreSQL query.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['connection_id', 'sql'],
      properties: { connection_id: connectionId, sql: { type: 'string', minLength: 1 }, parameters: { type: 'array' } }
    },
    outputSchema: {
      type: 'object', properties: { plan: {} }, required: ['plan']
    },
    permission: { provider: 'postgres', action: 'read:metadata', requiresConnection: true },
    riskLevel: 'LOW', timeoutMs: 120000, retry: { maxAttempts: 0 }, outputClassification: 'INTERNAL'
  }
];
