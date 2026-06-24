import type { RequestContext } from '../provider/types.js';
import { ToolRegistry } from '../registry/tool-registry.js';
import { PermissionEngine } from '../security/permission-engine.js';
import { PolicyEngine } from '../security/policy-engine.js';
import { OutputSanitizer } from '../security/output-sanitizer.js';
import { AuditLogger } from '../audit/audit-logger.js';
import { normalizeError } from '../errors/error-normalizer.js';

export class McpGateway {
  constructor(
    private readonly tools: ToolRegistry,
    private readonly permissionEngine: PermissionEngine,
    private readonly policyEngine: PolicyEngine,
    private readonly audit: AuditLogger,
    private readonly sanitizer: OutputSanitizer
  ) {}

  listTools() {
    return this.tools.listDefinitions().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));
  }

  async callTool(toolName: string, args: Record<string, unknown>, context: RequestContext) {
    const started = Date.now();
    const tool = this.tools.getDefinition(toolName);
    const baseAudit = this.audit.createBase({ context, tool, args });

    const permission = this.permissionEngine.evaluate({ tool, args, context });
    if (permission.decision !== 'ALLOW') {
      this.audit.write({
        ...baseAudit,
        permission_decision: permission.decision,
        policy_decision: 'NOT_EVALUATED',
        execution_status: permission.decision === 'REQUIRE_APPROVAL' ? 'approval_required' : 'denied',
        duration_ms: Date.now() - started,
        error_code: permission.decision
      });
      return { status: permission.decision, reason: permission.reason };
    }

    const policy = this.policyEngine.evaluate({ tool, args, context });
    if (policy.decision !== 'ALLOW' && policy.decision !== 'ALLOW_WITH_WARNING') {
      this.audit.write({
        ...baseAudit,
        permission_decision: permission.decision,
        policy_decision: policy.decision,
        execution_status: policy.decision === 'REQUIRE_APPROVAL' ? 'approval_required' : 'denied',
        duration_ms: Date.now() - started,
        error_code: policy.decision
      });
      return { status: policy.decision, reason: policy.reason };
    }

    try {
      const result = await this.tools.call(toolName, args, context);
      const sanitized = this.sanitizer.sanitize(result);
      this.audit.write({
        ...baseAudit,
        output_summary: summarize(sanitized),
        permission_decision: permission.decision,
        policy_decision: policy.decision,
        execution_status: 'success',
        duration_ms: Date.now() - started
      });
      return sanitized;
    } catch (error) {
      const normalized = normalizeError(error);
      this.audit.write({
        ...baseAudit,
        permission_decision: permission.decision,
        policy_decision: policy.decision,
        execution_status: 'failure',
        duration_ms: Date.now() - started,
        error_code: normalized.code
      });
      return { error: normalized };
    }
  }
}

function summarize(value: unknown): unknown {
  const text = JSON.stringify(value);
  if (text.length <= 2000) return value;
  return { summary: text.slice(0, 2000), truncated: true };
}
