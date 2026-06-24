# Permission Model

## 1. Mục tiêu

Permission model quản lý quyền chạy tool theo:

- user
- tenant
- role
- provider
- connection_id/account_id
- tool
- action type
- environment
- risk level
- data classification
- tainted data context

## 2. RBAC + ABAC + Policy

- RBAC: role `developer`, `admin`, `incident_manager`.
- ABAC: thuộc tính như tenant, environment, connection_id, risk level.
- Policy: rule cụ thể về SQL, outbound data, production, prompt injection.

## 3. Evaluation order

```text
1. Build RequestContext
2. Match explicit deny rules
3. Match allow rules
4. Check risk-level approval requirement
5. Check environment constraints
6. Check connection/account constraints
7. Evaluate policy engine
8. Return decision
```

Deny luôn thắng allow.

## 4. Permission rule shape

```yaml
roles:
  developer:
    allow:
      - provider: postgres
        tool: postgres.query_readonly
        connections: ["fintech_user_db"]
        environments: ["development", "staging"]
        risk_levels: ["LOW", "MEDIUM"]
        conditions:
          max_rows: 100
    deny:
      - provider: postgres
        tool: postgres.query_write
        connections: ["*"]
```

## 5. Tool risk levels

| Risk | Meaning | Examples | Default handling |
|---|---|---|---|
| LOW | Read metadata/list schema | `postgres.list_tables` | allow if role has read metadata |
| MEDIUM | Read business data | `postgres.query_readonly`, `github.get_file` | allow only scoped connection/repo |
| HIGH | Write data/create external side effect | `github.create_issue`, `slack.send_message` | require explicit permission, often approval |
| CRITICAL | Delete/execute/change infrastructure | `kubernetes.delete_pod`, `github.delete_repository` | disabled by default, require dangerous mode + approval |

## 6. Human approval mechanism

Approval required when:

- tool risk is HIGH/CRITICAL
- destructive action
- outbound data transfer
- tool call sau khi đọc untrusted content
- payload chứa nhiều dữ liệu
- payload giống secret/token/password
- provider metadata vừa thay đổi
- prompt injection scanner báo nghi ngờ

Approval message phải hiển thị:

- tool
- provider
- connection_id/account_id
- risk level
- sanitized arguments
- reason
- data classification
- policy decision
- prompt injection warning nếu có

## 7. Read-only mode

Provider/connection có thể bật readonly. Khi readonly:

- Chỉ cho read/list/describe/explain/sample.
- Block write/destructive tools dù role allow nếu policy không override explicit.
- SQL policy enforce token blocklist và statement type.

## 8. Per-tenant isolation

- Tenant A không thấy provider config/connection của Tenant B.
- `RequestContext.tenantId` bắt buộc.
- Permission rule phải scoped theo tenant.
- Audit log ghi tenant_id.
- Secret ref namespace nên có tenant prefix hoặc secret manager path riêng.

## 9. Connection-level permission

Ví dụ:

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
    deny:
      - provider: postgres
        tool: postgres.query_readonly
        connections: ["prod_ledger_db"]
```

## 10. Tainted data and cross-tool permissions

Nếu context chứa `tainted=true` từ nguồn untrusted external, outbound tools như `slack.send_message`, `github.create_issue`, `custom_http.post`, `email.send` phải require approval.

Policy examples:

- `TAINTED_EXTERNAL + outbound tool = require approval`
- `SECRET + any LLM output = block/redact`
- `CONFIDENTIAL + external send = require approval`
- `production data + Slack send = require approval`

## 11. Audit for permission decisions

Mọi decision phải ghi:

- matching deny rule nếu có
- matching allow rule nếu có
- required approval reason
- final decision: ALLOW / DENY / REQUIRE_APPROVAL
- sanitized input summary
