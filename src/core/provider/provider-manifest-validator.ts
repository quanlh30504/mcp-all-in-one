import type { ProviderManifest } from './types.js';
import { PromptInjectionScanner } from '../security/prompt-injection-scanner.js';

const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

export function validateProviderManifest(manifest: ProviderManifest): void {
  if (!manifest.name || !manifest.type || !manifest.version) {
    throw new Error('Provider manifest must include name, type and version');
  }

  const scanner = new PromptInjectionScanner();

  for (const tool of manifest.tools) {
    if (!TOOL_NAME_PATTERN.test(tool.name)) {
      throw new Error(`Invalid tool name: ${tool.name}`);
    }
    if (!tool.inputSchema || !tool.outputSchema) {
      throw new Error(`Tool must define input and output schema: ${tool.name}`);
    }
    if (!tool.permission || !tool.permission.provider || !tool.permission.action) {
      throw new Error(`Tool must define permission requirement: ${tool.name}`);
    }
    if (!tool.riskLevel) {
      throw new Error(`Tool must define riskLevel: ${tool.name}`);
    }

    const scan = scanner.scanText(tool.description, { source: 'tool_metadata' });
    if (scan.decision === 'BLOCK' || scan.decision === 'REQUIRE_HUMAN_APPROVAL') {
      throw new Error(`Suspicious tool metadata for ${tool.name}: ${scan.reasons.join(', ')}`);
    }
  }
}
