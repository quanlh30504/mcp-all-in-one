import type { DataClassification, MCPToolResult } from '../provider/types.js';

export function taintedExternalResult(input: {
  source: string;
  content: unknown;
  classification?: DataClassification;
  warnings?: string[];
}): MCPToolResult {
  return {
    content: input.content,
    metadata: {
      source: input.source,
      trustLevel: 'untrusted_external',
      tainted: true,
      classification: input.classification ?? 'TAINTED_EXTERNAL',
      warnings: input.warnings
    }
  };
}

export function trustedServerResult(input: {
  source: string;
  content: unknown;
  classification?: DataClassification;
}): MCPToolResult {
  return {
    content: input.content,
    metadata: {
      source: input.source,
      trustLevel: 'trusted_server',
      tainted: false,
      classification: input.classification ?? 'INTERNAL'
    }
  };
}
