export type JsonSchema = Record<string, unknown>;

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type DataClassification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'SECRET' | 'TAINTED_EXTERNAL';
export type TrustLevel = 'trusted_server' | 'trusted_manifest' | 'untrusted_external';

export interface RequestContext {
  requestId: string;
  correlationId: string;
  tenantId: string;
  userId: string;
  roles: string[];
  environment?: string;
  tainted?: boolean;
  dataClassifications?: DataClassification[];
  approvals?: Array<{ approvalId: string; scope: string }>;
}

export interface ProviderRuntimeConfig {
  providerName: string;
  providerType: string;
  rawConfig: Record<string, unknown>;
  secretResolver: SecretResolver;
}

export interface SecretResolver {
  resolve(ref: string): Promise<ResolvedSecret>;
}

export class ResolvedSecret {
  constructor(private readonly value: string) {}
  revealToProviderOnly(): string {
    return this.value;
  }
  toJSON(): never {
    throw new Error('ResolvedSecret cannot be serialized');
  }
  toString(): string {
    return '[REDACTED_SECRET]';
  }
}

export interface PermissionRequirement {
  provider: string;
  action: string;
  requiresConnection?: boolean;
  requiresAccount?: boolean;
  requiredRoles?: string[];
}

export interface RetryConfig {
  maxAttempts: number;
  backoffMs?: number;
}

export interface RateLimitConfig {
  requests: number;
  windowSeconds: number;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  permission: PermissionRequirement;
  riskLevel: RiskLevel;
  timeoutMs: number;
  retry: RetryConfig;
  rateLimit?: RateLimitConfig;
  outputClassification?: DataClassification;
}

export interface MCPToolResult {
  content: unknown;
  metadata: {
    source: string;
    trustLevel: TrustLevel;
    tainted: boolean;
    classification: DataClassification;
    warnings?: string[];
  };
}

export interface MCPResourceDefinition {
  name: string;
  uriTemplate: string;
  description: string;
  permission: PermissionRequirement;
  riskLevel: RiskLevel;
  outputClassification: DataClassification;
}

export interface MCPResourceResult {
  uri: string;
  content: unknown;
  metadata: MCPToolResult['metadata'];
}

export interface MCPPromptDefinition {
  name: string;
  version: string;
  description: string;
  argumentsSchema: JsonSchema;
  templateChecksum: string;
  reviewed: boolean;
}

export interface ProviderManifest {
  name: string;
  type: string;
  version: string;
  configSchema: JsonSchema;
  requiredSecretRefs: string[];
  tools: MCPToolDefinition[];
  resources?: MCPResourceDefinition[];
  prompts?: MCPPromptDefinition[];
  checksum?: string;
  signature?: string;
}

export interface MCPProvider {
  name: string;
  type: string;
  version: string;

  initialize(config: ProviderRuntimeConfig): Promise<void>;

  getTools(): MCPToolDefinition[];

  callTool(
    toolName: string,
    args: Record<string, unknown>,
    context: RequestContext
  ): Promise<MCPToolResult>;

  getResources?(): MCPResourceDefinition[];

  readResource?(uri: string, context: RequestContext): Promise<MCPResourceResult>;

  getPrompts?(): MCPPromptDefinition[];
}

export interface MCPProviderFactory {
  manifest: ProviderManifest;
  create(): MCPProvider;
}
