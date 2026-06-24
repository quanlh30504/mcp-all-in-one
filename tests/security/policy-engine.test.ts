import test from 'node:test';
import assert from 'node:assert/strict';
import { PolicyEngine } from '../../src/core/security/policy-engine.js';
import type { MCPToolDefinition, RequestContext } from '../../src/core/provider/types.js';

const context: RequestContext = {
  requestId: 'req',
  correlationId: 'corr',
  tenantId: 'tenant',
  userId: 'user',
  roles: ['developer'],
  tainted: false,
  dataClassifications: []
};

const postgresReadonlyTool: MCPToolDefinition = {
  name: 'postgres.query_readonly',
  description: 'readonly query',
  inputSchema: {},
  outputSchema: {},
  permission: { provider: 'postgres', action: 'read:data', requiresConnection: true },
  riskLevel: 'MEDIUM',
  timeoutMs: 5000,
  retry: { maxAttempts: 0 }
};

test('denies destructive SQL on readonly query tool', () => {
  const result = new PolicyEngine().evaluate({
    tool: postgresReadonlyTool,
    args: { connection_id: 'main', sql: 'DROP TABLE users' },
    context
  });
  assert.equal(result.decision, 'DENY');
});

test('requires approval for outbound tool after tainted context', () => {
  const slackTool: MCPToolDefinition = {
    name: 'slack.send_message',
    description: 'send slack message',
    inputSchema: {},
    outputSchema: {},
    permission: { provider: 'slack', action: 'write:message' },
    riskLevel: 'HIGH',
    timeoutMs: 5000,
    retry: { maxAttempts: 0 }
  };

  const result = new PolicyEngine().evaluate({
    tool: slackTool,
    args: { text: 'copied from github readme' },
    context: { ...context, tainted: true }
  });

  assert.equal(result.decision, 'REQUIRE_APPROVAL');
});
