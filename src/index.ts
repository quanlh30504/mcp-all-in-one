import { ProviderManager } from './core/provider/provider-manager.js';
import { ToolRegistry } from './core/registry/tool-registry.js';
import { SecretResolver } from './core/secrets/secret-resolver.js';
import { EnvSecretSource } from './core/secrets/env-secret-source.js';
import { PermissionEngine } from './core/security/permission-engine.js';
import { PolicyEngine } from './core/security/policy-engine.js';
import { OutputSanitizer } from './core/security/output-sanitizer.js';
import { AuditLogger } from './core/audit/audit-logger.js';
import { McpGateway } from './core/gateway/mcp-gateway.js';
import { loadProviderEntries } from './core/config/provider-config.js';
import { serveStdio } from './core/transport/stdio-server.js';
import { createPostgresProviderFactory } from './providers/postgres/index.js';
import { createGithubProviderFactory } from './providers/github/index.js';
import { createRedashProviderFactory } from './providers/redash/index.js';
import type { MCPProviderFactory } from './core/provider/types.js';

async function main() {
  const secretResolver = new SecretResolver([new EnvSecretSource()]);
  const providerManager = new ProviderManager();
  const tools = new ToolRegistry();
  const providerEntries = await loadProviderEntries();
  const factories = new Map<string, MCPProviderFactory>([
    ['postgres', createPostgresProviderFactory()],
    ['github', createGithubProviderFactory()],
    ['redash', createRedashProviderFactory()]
  ]);

  for (const [providerName, rawConfig] of Object.entries(providerEntries)) {
    if (rawConfig.enabled === false) continue;
    const providerType = String(rawConfig.type ?? providerName);
    const factory = factories.get(providerType);
    if (!factory) throw new Error(`Unsupported provider type: ${providerType}`);
    const provider = await providerManager.register(factory, {
      providerName,
      providerType,
      rawConfig,
      secretResolver
    });
    tools.registerTools(provider);
  }

  const gateway = new McpGateway(
    tools,
    new PermissionEngine(),
    new PolicyEngine(),
    new AuditLogger(),
    new OutputSanitizer()
  );

  if (!providerManager.listProviders().length) {
    process.stderr.write('No providers enabled. Set MCP_CONFIG_PATH or REDASH_URL/REDASH_API_KEY.\n');
  }
  await serveStdio(gateway);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
