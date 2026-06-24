import test from 'node:test';
import assert from 'node:assert/strict';
import { postgresTools } from '../../src/providers/postgres/tools.js';

test('postgres provider does not expose write tool by default', () => {
  const names = postgresTools.map((tool) => tool.name);
  assert.equal(names.includes('postgres.query_write'), false);
  assert.equal(names.includes('postgres.drop_table'), false);
});

test('every postgres tool has risk level and permission', () => {
  for (const tool of postgresTools) {
    assert.ok(tool.riskLevel);
    assert.ok(tool.permission.provider);
    assert.ok(tool.permission.action);
    assert.ok(tool.inputSchema);
    assert.ok(tool.outputSchema);
  }
});
