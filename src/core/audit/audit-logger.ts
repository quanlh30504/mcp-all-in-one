import type { MCPToolDefinition, RequestContext } from '../provider/types.js';
import { OutputSanitizer } from '../security/output-sanitizer.js';

export interface AuditRecord {
  request_id: string;
  correlation_id: string;
  timestamp: string;
  tenant_id: string;
  user_id: string;
  provider: string;
  connection_id?: string;
  tool_name: string;
  input_summary: unknown;
  output_summary?: unknown;
  permission_decision: string;
  policy_decision: string;
  execution_status: 'success' | 'failure' | 'denied' | 'approval_required';
  duration_ms: number;
  error_code?: string;
}

export class AuditLogger {
  private readonly sanitizer = new OutputSanitizer();

  write(record: AuditRecord): void {
    const safeRecord = this.sanitizer.sanitize(record);
    // stdout is reserved for MCP stdio JSON-RPC frames.
    process.stderr.write(JSON.stringify({ audit: safeRecord }) + '\n');
  }

  createBase(input: { context: RequestContext; tool: MCPToolDefinition; args: Record<string, unknown> }): Pick<AuditRecord, 'request_id' | 'correlation_id' | 'timestamp' | 'tenant_id' | 'user_id' | 'provider' | 'connection_id' | 'tool_name' | 'input_summary'> {
    return {
      request_id: input.context.requestId,
      correlation_id: input.context.correlationId,
      timestamp: new Date().toISOString(),
      tenant_id: input.context.tenantId,
      user_id: input.context.userId,
      provider: input.tool.permission.provider,
      connection_id: typeof input.args.connection_id === 'string' ? input.args.connection_id : undefined,
      tool_name: input.tool.name,
      input_summary: this.sanitizer.sanitize(input.args)
    };
  }
}
