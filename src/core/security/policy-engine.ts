import type { MCPToolDefinition, RequestContext } from '../provider/types.js';

export type PolicyDecision = 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL' | 'ALLOW_WITH_WARNING';

export interface PolicyEvaluation {
  decision: PolicyDecision;
  reason: string;
  warnings?: string[];
}

const BLOCKED_SQL_KEYWORDS = /\b(DROP|DELETE|TRUNCATE|ALTER|INSERT|UPDATE|CREATE)\b/i;

export class PolicyEngine {
  evaluate(input: {
    tool: MCPToolDefinition;
    args: Record<string, unknown>;
    context: RequestContext;
  }): PolicyEvaluation {
    const { tool, args, context } = input;

    if (tool.name === 'postgres.query_readonly' || tool.name === 'postgres.explain_query') {
      const sql = String(args.sql ?? '');
      if (hasMultipleStatements(sql)) {
        return { decision: 'DENY', reason: 'Multi-statement SQL is not allowed.' };
      }
      if (BLOCKED_SQL_KEYWORDS.test(sql)) {
        return { decision: 'DENY', reason: 'Write/destructive SQL keyword is not allowed for readonly tools.' };
      }
      if (!/^\s*(SELECT|WITH|EXPLAIN)\b/i.test(sql)) {
        return { decision: 'DENY', reason: 'Only SELECT/WITH/EXPLAIN statements are allowed.' };
      }
    }

    if (isOutboundTool(tool.name) && context.tainted) {
      return { decision: 'REQUIRE_APPROVAL', reason: 'Outbound tool after tainted data requires approval.' };
    }

    if (isOutboundTool(tool.name) && payloadContainsSecretPattern(args)) {
      return { decision: 'DENY', reason: 'Outbound payload contains secret-like pattern.' };
    }

    return { decision: 'ALLOW', reason: 'No policy violation.' };
  }
}

function hasMultipleStatements(sql: string): boolean {
  return sql.split(';').map((s) => s.trim()).filter(Boolean).length > 1;
}

function isOutboundTool(toolName: string): boolean {
  return [
    'slack.send_message',
    'github.create_issue',
    'github.comment_on_issue',
    'custom_http.post',
    'email.send'
  ].includes(toolName);
}

function payloadContainsSecretPattern(value: unknown): boolean {
  const text = JSON.stringify(value);
  return /(ghp_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN PRIVATE KEY-----|Authorization:\s*Bearer\s+)/i.test(text);
}
