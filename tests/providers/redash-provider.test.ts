import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { AddressInfo } from 'node:net';
import { RedashProvider } from '../../src/providers/redash/index.js';
import { ResolvedSecret, type ProviderRuntimeConfig, type RequestContext } from '../../src/core/provider/types.js';

const context: RequestContext = {
  requestId: 'req',
  correlationId: 'corr',
  tenantId: 'tenant',
  userId: 'user',
  roles: ['reader']
};

test('lists connection IDs without exposing URL or API key', async () => {
  const provider = await createProvider('http://localhost:1');
  const result = await provider.callTool('redash.list_connections', {}, context);
  assert.deepEqual(result.content, { connections: ['analytics'] });
  assert.equal(JSON.stringify(result).includes('test-api-key'), false);
  assert.equal(JSON.stringify(result).includes('localhost'), false);
});

test('reads cached rows and enforces max_rows', async (t) => {
  const fixture = await startFixture((request, response) => {
    assert.equal(request.headers.authorization, 'Key test-api-key');
    assert.equal(request.url, '/redash/api/queries/123/results.json');
    json(response, 200, { query_result: { data: { rows: [{ id: 1 }, { id: 2 }, { id: 3 }] } } });
  });
  t.after(fixture.close);
  const provider = await createProvider(`${fixture.baseUrl}/redash`, { max_rows: 2 });

  const result = await provider.callTool('redash.get_cached_query_results', {
    connection_id: 'analytics', query_id: 123, max_rows: 99
  }, context);

  assert.deepEqual(result.content, {
    rows: [{ id: 1 }, { id: 2 }],
    row_count: 3,
    returned_row_count: 2,
    truncated: true,
    cached: true
  });
  assert.equal(result.metadata.tainted, true);
});

test('posts parameters, polls a job, and fetches its result', async (t) => {
  const requests: string[] = [];
  const fixture = await startFixture(async (request, response) => {
    requests.push(`${request.method} ${request.url}`);
    if (request.url === '/api/queries/123/results') {
      const body = await readBody(request);
      assert.deepEqual(JSON.parse(body), { parameters: { day: '2026-06-25' }, max_age: 0 });
      json(response, 200, { job: { id: 'job-1' } });
    } else if (request.url === '/api/jobs/job-1') {
      json(response, 200, { job: { status: 3, query_result_id: 77 } });
    } else if (request.url === '/api/query_results/77.json') {
      json(response, 200, { query_result: { data: { rows: [{ value: 42 }] } } });
    } else {
      json(response, 404, {});
    }
  });
  t.after(fixture.close);
  const provider = await createProvider(fixture.baseUrl);

  const result = await provider.callTool('redash.fetch_query_results', {
    connection_id: 'analytics', query_id: 123, parameters: { day: '2026-06-25' }
  }, context);

  assert.deepEqual((result.content as { rows: unknown[] }).rows, [{ value: 42 }]);
  assert.deepEqual(requests, [
    'POST /api/queries/123/results',
    'GET /api/jobs/job-1',
    'GET /api/query_results/77.json'
  ]);
});

test('falls back to cached results when refresh is forbidden', async (t) => {
  const fixture = await startFixture((request, response) => {
    if (request.method === 'POST') json(response, 403, {});
    else json(response, 200, { query_result: { data: { rows: [{ cached: true }] } } });
  });
  t.after(fixture.close);
  const provider = await createProvider(fixture.baseUrl);

  const result = await provider.callTool('redash.fetch_query_results', {
    connection_id: 'analytics', query_id: 123
  }, context);

  assert.equal((result.content as { cached: boolean }).cached, true);
  assert.match(result.metadata.warnings?.[0] ?? '', /forbidden/i);
});

test('auto mode falls back to the legacy refresh endpoint on 404', async (t) => {
  const requests: string[] = [];
  const fixture = await startFixture((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    if (request.url === '/api/queries/123/results') json(response, 404, {});
    else if (request.url === '/api/queries/123/refresh?p_date=2026-06-25') {
      json(response, 200, { query_result: { data: { rows: [{ legacy: true }] } } });
    } else json(response, 404, {});
  });
  t.after(fixture.close);
  const provider = await createProvider(fixture.baseUrl);

  const result = await provider.callTool('redash.fetch_query_results', {
    connection_id: 'analytics', query_id: 123, parameters: { date: '2026-06-25' }
  }, context);

  assert.deepEqual((result.content as { rows: unknown[] }).rows, [{ legacy: true }]);
  assert.deepEqual(requests, [
    'POST /api/queries/123/results',
    'POST /api/queries/123/refresh?p_date=2026-06-25'
  ]);
});

test('rejects a query outside the allowlist before making a request', async () => {
  const provider = await createProvider('http://localhost:1');
  await assert.rejects(
    provider.callTool('redash.get_query', { connection_id: 'analytics', query_id: 999 }, context),
    /allowlist/
  );
});

async function createProvider(baseUrl: string, overrides: Record<string, unknown> = {}): Promise<RedashProvider> {
  const provider = new RedashProvider();
  const config: ProviderRuntimeConfig = {
    providerName: 'redash',
    providerType: 'redash',
    rawConfig: {
      connections: {
        analytics: {
          base_url: baseUrl,
          api_key_ref: 'test:key',
          query_allowlist: [123],
          request_timeout_ms: 2000,
          max_wait_seconds: 2,
          ...overrides
        }
      }
    },
    secretResolver: { resolve: async () => new ResolvedSecret('test-api-key') }
  };
  await provider.initialize(config);
  return provider;
}

async function startFixture(
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => void handler(request, response));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => { server.close(); await once(server, 'close'); }
  };
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(value));
}

async function readBody(request: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of request) body += String(chunk);
  return body;
}
