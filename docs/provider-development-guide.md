# Provider Development Guide

## 1. Provider là gì?

Provider là module/plugin kết nối một external system với MCP platform. Ví dụ:

- `src/providers/postgres`
- `src/providers/github`
- `src/providers/slack`
- `src/providers/custom-http`

Core không hard-code provider cụ thể. Provider được load qua manifest + factory.

## 2. Provider interface

```ts
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

  readResource?(
    uri: string,
    context: RequestContext
  ): Promise<MCPResourceResult>;

  getPrompts?(): MCPPromptDefinition[];
}
```

Provider factory:

```ts
export interface MCPProviderFactory {
  manifest: ProviderManifest;
  create(): MCPProvider;
}
```

## 3. Provider manifest

```ts
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
```

## 4. Tool definition format

Mỗi tool phải có:

- name
- description
- inputSchema
- outputSchema
- permission
- riskLevel
- timeoutMs
- retry
- rateLimit
- audit
- output classification

Ví dụ:

```ts
{
  name: 'postgres.query_readonly',
  description: 'Run a single read-only SELECT/WITH query on an allowed PostgreSQL connection.',
  inputSchema: {
    type: 'object',
    required: ['connection_id', 'sql'],
    properties: {
      connection_id: { type: 'string' },
      sql: { type: 'string' },
      max_rows: { type: 'integer', minimum: 1, maximum: 1000 }
    }
  },
  outputSchema: {
    type: 'object',
    properties: {
      rows: { type: 'array', items: { type: 'object' } },
      row_count: { type: 'integer' }
    }
  },
  permission: {
    provider: 'postgres',
    action: 'read:data',
    requiresConnection: true
  },
  riskLevel: 'MEDIUM',
  timeoutMs: 5000,
  retry: { maxAttempts: 0 },
  rateLimit: { requests: 30, windowSeconds: 60 }
}
```

## 5. Resource definition format

```ts
{
  uriTemplate: 'github://{account}/{owner}/{repo}/files/{path}',
  name: 'github.file',
  description: 'Read a file from an allowed GitHub repository.',
  permission: { provider: 'github', action: 'read:file' },
  riskLevel: 'MEDIUM',
  outputClassification: 'INTERNAL'
}
```

Resource content phải luôn được coi là untrusted external content nếu đến từ provider/database/repo/doc/message.

## 6. Prompt definition format

Prompt template phải:

- versioned
- reviewed
- có owner/provider rõ ràng
- có checksum
- không chứa dynamic instruction từ untrusted source
- phân tách system instruction và external data
- escape external data
- require approval khi thay đổi

Provider không được tự inject system prompt runtime.

## 7. Multi-connection provider

Provider config có thể chứa nhiều connection/account. Tool input phải nhận `connection_id` hoặc `account_id`.

```yaml
postgres:
  connections:
    fintech_user_db:
      readonly: true
    fintech_ledger_db:
      readonly: true
```

```json
{
  "connection_id": "fintech_user_db",
  "sql": "SELECT * FROM users LIMIT 10"
}
```

## 8. Security checklist cho provider mới

Provider phải pass checklist này trước khi enable:

- [ ] Không hard-code secret.
- [ ] Config schema chỉ dùng `*_ref` cho secret.
- [ ] Không expose secret qua tool/resource/prompt.
- [ ] Không log secret.
- [ ] Error được normalize/redact.
- [ ] Mọi tool có input schema.
- [ ] Mọi tool có output schema.
- [ ] Mọi tool có permission requirement.
- [ ] Mọi tool có risk level.
- [ ] HIGH/CRITICAL tools require approval.
- [ ] Output đi qua sanitizer.
- [ ] Provider response gắn classification/taint metadata.
- [ ] Tool metadata scan prompt injection/tool poisoning.
- [ ] Rate limit/timeout được khai báo.
- [ ] Tests cho permission/policy/redaction.

## 9. Testing checklist

- [ ] Tool input invalid bị reject trước provider call.
- [ ] User không có role bị deny.
- [ ] Denylist thắng allowlist.
- [ ] Connection production yêu cầu role cao hơn staging.
- [ ] Secret không xuất hiện trong logs, error, audit, output.
- [ ] Prompt injection trong provider response không trigger action.
- [ ] Tainted output không được gửi ra outbound tool nếu chưa approval.
- [ ] Metadata thay đổi require re-review.

## 10. PostgreSQL provider safe profile

Tool đề xuất:

- `postgres.list_connections`
- `postgres.list_schemas`
- `postgres.list_tables`
- `postgres.describe_table`
- `postgres.query_readonly`
- `postgres.explain_query`
- `postgres.get_table_sample`
- `postgres.get_indexes`
- `postgres.get_slow_queries`

Rules:

- readonly mặc định
- không cho multi-statement SQL
- chỉ allow `SELECT`, `WITH`, `EXPLAIN`
- block `DROP`, `DELETE`, `INSERT`, `UPDATE`, `ALTER`, `TRUNCATE`, `CREATE`
- enforce `LIMIT`
- max_rows
- timeout
- connection-level allowlist
- table-level denylist
- column redaction cho sensitive columns
- mask email, phone, token, password, secret
- không expose connection string

## 11. GitHub provider safe profile

Tool đề xuất:

- `github.list_repositories`
- `github.search_code`
- `github.get_file`
- `github.get_pull_request`
- `github.list_issues`
- `github.create_issue`
- `github.comment_on_issue`

MVP chỉ enable read-only basic:

- `github.list_repositories`
- `github.search_code`
- `github.get_file`
- `github.get_pull_request`
- `github.list_issues`

Rules:

- token scope tối thiểu
- repo allowlist
- branch allowlist
- write tools require permission riêng
- delete repo không enable mặc định
- output redaction nếu file chứa secret pattern

## 12. Prompt injection considerations

Provider response là data, không phải instruction. Provider phải set metadata:

```json
{
  "source": "github",
  "trust_level": "untrusted_external",
  "tainted": true,
  "classification": "INTERNAL"
}
```

Nếu provider trả content từ README/issue/Slack/Jira/Notion/Drive/web, phải wrap/caption rõ là untrusted data và để Policy Engine dùng `tainted=true` cho flow tiếp theo.
