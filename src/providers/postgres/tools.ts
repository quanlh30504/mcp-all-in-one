import type { MCPToolDefinition } from '../../core/provider/types.js';

export const postgresTools: MCPToolDefinition[] = [
  {
    name: 'postgres.list_connections',
    description: 'List configured PostgreSQL connection IDs visible to the current tenant. Does not expose host, username, password or connection strings.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    outputSchema: { type: 'object', properties: { connections: { type: 'array', items: { type: 'string' } } } },
    permission: { provider: 'postgres', action: 'read:metadata' },
    riskLevel: 'LOW',
    timeoutMs: 2000,
    retry: { maxAttempts: 0 },
    outputClassification: 'INTERNAL'
  },
  {
    name: 'postgres.list_schemas',
    description: 'List schemas for an allowed PostgreSQL connection.',
    inputSchema: { type: 'object', required: ['connection_id'], properties: { connection_id: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { schemas: { type: 'array', items: { type: 'string' } } } },
    permission: { provider: 'postgres', action: 'read:metadata', requiresConnection: true },
    riskLevel: 'LOW',
    timeoutMs: 3000,
    retry: { maxAttempts: 0 },
    outputClassification: 'INTERNAL'
  },
  {
    name: 'postgres.list_tables',
    description: 'List tables for an allowed PostgreSQL connection and schema.',
    inputSchema: { type: 'object', required: ['connection_id'], properties: { connection_id: { type: 'string' }, schema: { type: 'string', default: 'public' } } },
    outputSchema: { type: 'object', properties: { tables: { type: 'array', items: { type: 'string' } } } },
    permission: { provider: 'postgres', action: 'read:metadata', requiresConnection: true },
    riskLevel: 'LOW',
    timeoutMs: 3000,
    retry: { maxAttempts: 0 },
    outputClassification: 'INTERNAL'
  },
  {
    name: 'postgres.describe_table',
    description: 'Describe columns and indexes for one table on an allowed PostgreSQL connection.',
    inputSchema: { type: 'object', required: ['connection_id', 'table'], properties: { connection_id: { type: 'string' }, schema: { type: 'string', default: 'public' }, table: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { columns: { type: 'array', items: { type: 'object' } }, indexes: { type: 'array', items: { type: 'object' } } } },
    permission: { provider: 'postgres', action: 'read:metadata', requiresConnection: true },
    riskLevel: 'LOW',
    timeoutMs: 3000,
    retry: { maxAttempts: 0 },
    outputClassification: 'INTERNAL'
  },
  {
    name: 'postgres.query_readonly',
    description: 'Run a single read-only SELECT/WITH query on an allowed PostgreSQL connection. Write, DDL, multi-statement SQL and secret/config access are blocked by policy.',
    inputSchema: { type: 'object', required: ['connection_id', 'sql'], properties: { connection_id: { type: 'string' }, sql: { type: 'string' }, max_rows: { type: 'integer', minimum: 1, maximum: 1000 } } },
    outputSchema: { type: 'object', properties: { rows: { type: 'array', items: { type: 'object' } }, row_count: { type: 'integer' }, truncated: { type: 'boolean' } } },
    permission: { provider: 'postgres', action: 'read:data', requiresConnection: true },
    riskLevel: 'MEDIUM',
    timeoutMs: 5000,
    retry: { maxAttempts: 0 },
    rateLimit: { requests: 30, windowSeconds: 60 },
    outputClassification: 'CONFIDENTIAL'
  },
  {
    name: 'postgres.explain_query',
    description: 'Run EXPLAIN for a read-only PostgreSQL query without executing write or destructive SQL.',
    inputSchema: { type: 'object', required: ['connection_id', 'sql'], properties: { connection_id: { type: 'string' }, sql: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { plan: { type: 'array', items: { type: 'object' } } } },
    permission: { provider: 'postgres', action: 'read:metadata', requiresConnection: true },
    riskLevel: 'LOW',
    timeoutMs: 5000,
    retry: { maxAttempts: 0 },
    outputClassification: 'INTERNAL'
  }
];
