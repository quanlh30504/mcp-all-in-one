import test from 'node:test';
import assert from 'node:assert/strict';
import type { ClientConfig } from 'pg';
import { PostgresProvider, type PgClientFactory, type PgClientLike } from '../../src/providers/postgres/index.js';
import { ResolvedSecret, type ProviderRuntimeConfig, type RequestContext } from '../../src/core/provider/types.js';

const context: RequestContext = {
  requestId: 'req', correlationId: 'corr', tenantId: 'tenant', userId: 'user', roles: ['reader']
};

class FakeClient implements PgClientLike {
  readonly calls: Array<{ sql: string; values?: unknown[] }> = [];
  connected = false;
  ended = false;
  failUserQuery = false;

  async connect(): Promise<void> { this.connected = true; }

  async query(sql: string, values?: unknown[]) {
    this.calls.push({ sql, values });
    if (sql.includes("current_setting('transaction_read_only')")) return result([{ value: 'on' }]);
    if (sql.includes('information_schema.schemata')) return result([{ schema_name: 'analytics' }]);
    if (sql.includes('information_schema.tables')) {
      return result([
        { schema: 'analytics', name: 'events', type: 'BASE TABLE' },
        { schema: 'analytics', name: 'secret_events', type: 'BASE TABLE' }
      ]);
    }
    if (sql.includes('information_schema.columns')) {
      return result([{ name: 'id', data_type: 'bigint', nullable: false, ordinal_position: 1 }]);
    }
    if (sql.includes('FROM pg_indexes')) return result([{ name: 'events_pkey', definition: 'CREATE UNIQUE INDEX ...' }]);
    if (sql.startsWith('EXPLAIN')) return result([{ 'QUERY PLAN': [{ Plan: { 'Node Type': 'Seq Scan' } }] }]);
    if (sql.includes('AS mcp_readonly_query')) {
      if (this.failUserQuery) throw new Error('query failed');
      return result([
        { id: 1, email: 'a@example.com', password_hash: 'hash-1' },
        { id: 2, email: 'b@example.com', password_hash: 'hash-2' },
        { id: 3, email: 'c@example.com', password_hash: 'hash-3' }
      ]);
    }
    return result([]);
  }

  async end(): Promise<void> { this.ended = true; }
}

test('lists connection IDs without exposing connection details', async () => {
  const { provider } = await createProvider();
  const value = await provider.callTool('postgres.list_connections', {}, context);
  assert.deepEqual(value.content, { connections: ['warehouse'] });
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes('db.internal'), false);
  assert.equal(serialized.includes('test-password'), false);
});

test('executes queries in a bounded READ ONLY transaction and redacts rows', async () => {
  const { provider, clients, configs } = await createProvider();
  const value = await provider.callTool('postgres.query_readonly', {
    connection_id: 'warehouse',
    sql: 'SELECT id, email, password_hash FROM analytics.events WHERE id > $1',
    parameters: [0],
    max_rows: 2
  }, context);

  assert.deepEqual(value.content, {
    rows: [
      { id: 1, email: '[MASKED_EMAIL]', password_hash: '[REDACTED]' },
      { id: 2, email: '[MASKED_EMAIL]', password_hash: '[REDACTED]' }
    ],
    row_count: 2,
    truncated: true
  });
  assert.equal(value.metadata.tainted, true);
  assert.equal(configs[0].user, 'test-user');
  assert.equal(configs[0].password, 'test-password');
  assert.equal(clients[0].calls[0].sql, 'BEGIN TRANSACTION READ ONLY');
  assert.ok(clients[0].calls.some(call => call.sql.includes('SET LOCAL statement_timeout = 5000')));
  const userCall = clients[0].calls.find(call => call.sql.includes('AS mcp_readonly_query'));
  assert.deepEqual(userCall?.values, [0, 3]);
  assert.match(userCall?.sql ?? '', /LIMIT \$2$/);
  assert.equal(clients[0].calls.at(-1)?.sql, 'ROLLBACK');
  assert.equal(clients[0].ended, true);
});

test('implements schema, table and describe metadata tools', async () => {
  const { provider } = await createProvider();
  const schemas = await provider.callTool('postgres.list_schemas', { connection_id: 'warehouse' }, context);
  assert.deepEqual(schemas.content, { schemas: ['analytics'] });

  const tables = await provider.callTool('postgres.list_tables', {
    connection_id: 'warehouse', schema: 'analytics'
  }, context);
  assert.deepEqual(tables.content, {
    tables: [{ schema: 'analytics', name: 'events', type: 'BASE TABLE' }]
  });

  const description = await provider.callTool('postgres.describe_table', {
    connection_id: 'warehouse', schema: 'analytics', table: 'events'
  }, context);
  assert.deepEqual(description.content, {
    columns: [{ name: 'id', data_type: 'bigint', nullable: false, ordinal_position: 1 }],
    indexes: [{ name: 'events_pkey', definition: 'CREATE UNIQUE INDEX ...' }]
  });
});

test('runs EXPLAIN JSON without ANALYZE', async () => {
  const { provider, clients } = await createProvider();
  const value = await provider.callTool('postgres.explain_query', {
    connection_id: 'warehouse', sql: 'SELECT id FROM analytics.events'
  }, context);
  assert.deepEqual(value.content, { plan: [{ Plan: { 'Node Type': 'Seq Scan' } }] });
  const explain = clients[0].calls.find(call => call.sql.startsWith('EXPLAIN'));
  assert.match(explain?.sql ?? '', /ANALYZE FALSE/);
});

test('rejects non-readonly config', async () => {
  await assert.rejects(createProvider({ readonly: false }), /must set readonly: true/);
});

async function createProvider(overrides: Record<string, unknown> = {}) {
  const clients: FakeClient[] = [];
  const configs: ClientConfig[] = [];
  const factory: PgClientFactory = config => {
    configs.push(config);
    const client = new FakeClient();
    clients.push(client);
    return client;
  };
  const provider = new PostgresProvider(factory);
  const config: ProviderRuntimeConfig = {
    providerName: 'postgres', providerType: 'postgres',
    rawConfig: {
      connections: {
        warehouse: {
          host: 'db.internal', port: 5432, database: 'warehouse',
          username_ref: 'test:username', password_ref: 'test:password', readonly: true,
          schemas_allowlist: ['analytics'],
          table_denylist: ['analytics.secret_events'],
          column_redaction: [{ pattern: '(?i)email', replacement: '[MASKED_EMAIL]' }],
          ...overrides
        }
      }
    },
    secretResolver: {
      resolve: async ref => new ResolvedSecret(ref.endsWith('username') ? 'test-user' : 'test-password')
    }
  };
  await provider.initialize(config);
  return { provider, clients, configs };
}

function result(rows: Record<string, unknown>[]) {
  return { rows, rowCount: rows.length };
}
