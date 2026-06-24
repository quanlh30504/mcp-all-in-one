# Configuration Guide

## 1. File layout

```text
configs/
  providers.example.yaml
  permissions.example.yaml
  tenants.example.yaml
  policies.example.yaml
```

Production nên dùng bản không `.example`, ví dụ `configs/providers.yaml`, được mount qua deployment secret/config map nhưng vẫn không chứa secret thật.

## 2. Provider config schema

Top-level:

```yaml
providers:
  <provider-name>:
    enabled: true
    type: <provider-type>
    version: <provider-version-constraint>
    ... provider-specific config ...
```

Provider config phải validate bằng provider `configSchema` trước khi initialize.

## 3. Secret reference format

```text
env:NAME
file-encrypted:path#key
docker-secret:name
k8s:namespace/name#key
aws-sm:region/secret-name#json-key
gcp-sm:project/secret/versions/latest
vault:path#key
onepassword:vault/item/field
doppler:project/config/secret
```

MVP implement `env:` trước.

## 4. PostgreSQL config example

```yaml
providers:
  postgres:
    enabled: true
    type: postgres
    connections:
      fintech_user_db:
        environment: development
        host: localhost
        port: 5432
        database: fintech_user
        username_ref: env:POSTGRES_USER
        password_ref: env:POSTGRES_PASSWORD
        readonly: true
        max_rows: 100
        statement_timeout_ms: 5000
        table_denylist:
          - users.password_hash
          - users.reset_token
```

## 5. GitHub config example

```yaml
providers:
  github:
    enabled: true
    type: github
    accounts:
      personal:
        token_ref: env:GITHUB_TOKEN
        default_owner: my-org
        repo_allowlist:
          - my-org/*
        branch_allowlist:
          - main
          - develop
```

## 6. Redash config example

```yaml
providers:
  redash:
    enabled: true
    type: redash
    connections:
      analytics:
        base_url: https://redash.example.com
        api_key_ref: env:REDASH_API_KEY
        query_allowlist: [123, 456]
        max_rows: 500
        max_wait_seconds: 120
        request_timeout_ms: 15000
        refresh_enabled: true
        cached_fallback_enabled: true
        api_mode: auto
```

`query_allowlist` bắt buộc và nên chứa explicit query IDs. `api_mode` nhận
`auto`, `results` hoặc `legacy_refresh`. Nếu không dùng YAML, server có thể tạo
connection `default` từ `REDASH_URL`, `REDASH_API_KEY` và
`REDASH_QUERY_ALLOWLIST`.

## 7. Tenant config

Tenant config định nghĩa environments, users, roles và provider visibility.

```yaml
tenants:
  fintech:
    environments:
      development:
        default_readonly: true
      production:
        default_readonly: true
        require_approval_for_high_risk: true
    users:
      an@example.com:
        roles: [developer]
```

## 8. Permission config

Deny thắng allow. Rule có thể match provider, tool, connection, environment, risk level.

```yaml
roles:
  developer:
    allow:
      - provider: postgres
        tool: postgres.list_tables
        connections: ["fintech_user_db", "fintech_ledger_db"]
      - provider: postgres
        tool: postgres.query_readonly
        connections: ["fintech_user_db"]
        conditions:
          max_rows: 100
    deny:
      - provider: postgres
        tool: postgres.query_write
        connections: ["*"]
```

## 9. Policy config

Policy chạy sau permission và trước provider call.

```yaml
policies:
  - id: postgres-readonly-sql
    effect: deny
    when:
      provider: postgres
      tool: postgres.query_readonly
      connection_readonly: true
      sql_contains_any:
        - DROP
        - DELETE
        - TRUNCATE
        - ALTER
        - INSERT
        - UPDATE
        - CREATE
    reason: Readonly connection cannot execute write/destructive SQL.
```

## 10. Environment variable pattern

Tên env nên rõ tenant/provider/connection:

```text
MCP_POSTGRES_FINTECH_USER_DB_USERNAME
MCP_POSTGRES_FINTECH_USER_DB_PASSWORD
MCP_GITHUB_PERSONAL_TOKEN
MCP_REDASH_ANALYTICS_API_KEY
```

Nhưng config có thể dùng alias ngắn trong dev:

```yaml
username_ref: env:POSTGRES_USER
password_ref: env:POSTGRES_PASSWORD
```

## 11. Config reload safety

Khi reload config:

1. Validate schema toàn bộ.
2. Diff provider manifest/tool metadata.
3. Nếu tool metadata thay đổi, mark changed và require approval.
4. Load config mới vào shadow runtime.
5. Health check provider.
6. Swap atomically.
7. Audit config reload event.

## 12. Không được expose config qua resource/tool

Không tạo resource như:

```text
config://providers
secret://env
```

Nếu cần admin API, API đó nằm ngoài MCP tools và phải có auth riêng, masking và audit.
