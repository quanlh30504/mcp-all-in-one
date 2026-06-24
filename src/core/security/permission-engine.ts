import type { MCPToolDefinition, RequestContext } from '../provider/types.js';

export type PermissionDecision = 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL';

export interface PermissionEvaluation {
  decision: PermissionDecision;
  reason: string;
}

export class PermissionEngine {
  evaluate(input: {
    tool: MCPToolDefinition;
    args: Record<string, unknown>;
    context: RequestContext;
  }): PermissionEvaluation {
    const { tool, context } = input;

    if (tool.name.endsWith('.read_secret') || tool.name.endsWith('.show_env') || tool.name.endsWith('.show_config')) {
      return { decision: 'DENY', reason: 'Secret/config/environment inspection tools are forbidden.' };
    }

    if ((tool.riskLevel === 'HIGH' || tool.riskLevel === 'CRITICAL') && !hasApproval(context, tool.name)) {
      return { decision: 'REQUIRE_APPROVAL', reason: `${tool.riskLevel} risk tool requires approval.` };
    }

    // MVP placeholder: wire configs/permissions.example.yaml here.
    if (!context.roles.length) {
      return { decision: 'DENY', reason: 'User has no roles.' };
    }

    return { decision: 'ALLOW', reason: 'Allowed by MVP default role gate. Replace with config-backed deny-first RBAC.' };
  }
}

function hasApproval(context: RequestContext, scope: string): boolean {
  return Boolean(context.approvals?.some((approval) => approval.scope === scope || approval.scope === '*'));
}
