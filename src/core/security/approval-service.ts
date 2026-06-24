import type { MCPToolDefinition, RequestContext } from '../provider/types.js';

export interface ApprovalRequest {
  tool: string;
  provider: string;
  connectionId?: string;
  accountId?: string;
  riskLevel: string;
  sanitizedArguments: Record<string, unknown>;
  reason: string;
  dataClassification?: string[];
  promptInjectionWarning?: string[];
}

export class ApprovalService {
  buildApprovalRequest(input: {
    tool: MCPToolDefinition;
    args: Record<string, unknown>;
    context: RequestContext;
    reason: string;
    warnings?: string[];
  }): ApprovalRequest {
    return {
      tool: input.tool.name,
      provider: input.tool.permission.provider,
      connectionId: String(input.args.connection_id ?? ''),
      accountId: String(input.args.account_id ?? ''),
      riskLevel: input.tool.riskLevel,
      sanitizedArguments: sanitizeArgs(input.args),
      reason: input.reason,
      dataClassification: input.context.dataClassifications,
      promptInjectionWarning: input.warnings
    };
  }
}

function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(args));
  for (const key of Object.keys(clone)) {
    if (/password|token|secret|private_key|api_key/i.test(key)) clone[key] = '[REDACTED]';
  }
  return clone;
}
