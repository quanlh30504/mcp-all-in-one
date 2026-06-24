# Security Model

## 1. Security goals

- AI/LLM không đọc được provider secret.
- Core không expose raw provider config.
- Mọi tool call được authorize/policy-check server-side.
- Tool result được sanitize trước khi trả về MCP client.
- Audit log đầy đủ nhưng không chứa secret hoặc raw sensitive data.
- Prompt injection không thể bypass permission/policy.

## 2. Trust boundary

### Trusted

- MCP server code đã review.
- Static provider manifest đã ký/duyệt.
- Permission config.
- Policy config.
- Server-side Secret Resolver.
- Output Sanitizer / Redactor.

### Untrusted

- User input.
- LLM output.
- Provider response.
- Database rows.
- GitHub issue/PR/code comment/README.
- Slack/Jira/Notion/Google Drive content.
- Web page content.
- Dynamic provider metadata.
- Remote MCP server tool descriptions nếu chưa verify.

## 3. Secret flow

```text
AI Host
  -> MCP Client
  -> MCP Gateway
  -> Auth Middleware
  -> Permission Middleware
  -> Tool Registry
  -> Provider Manager
  -> Secret Resolver
  -> Provider Adapter
  -> External API / Database
```

Secret chỉ đi từ Secret Resolver đến Provider Adapter. Secret không đi ngược lại Tool Result. Secret không được đưa vào prompt/context của LLM.

## 4. LLM được thấy gì

LLM/AI chỉ được thấy:

- tool name
- tool description đã validate
- input schema
- output result đã sanitize
- error đã normalize
- metadata không nhạy cảm như `request_id`, `classification`, `tainted`

LLM/AI tuyệt đối không được thấy:

- API key
- access token
- refresh token
- database password
- connection string đầy đủ
- private key
- secret environment variables
- raw provider config có chứa secret
- raw exception chứa token/connection string

## 5. Why AI cannot read provider secrets

1. Config chỉ lưu secret reference như `env:GITHUB_TOKEN`, không lưu token thật.
2. Secret Resolver chạy server-side và không đăng ký tool `read_secret`, `show_env`, `show_config`.
3. Provider nhận secret qua runtime object/private closure, không expose lại qua resources/tools.
4. Tool result luôn qua Output Sanitizer.
5. Audit log chỉ ghi `secret_ref`, không ghi secret value.
6. Exception được normalize, không trả raw driver error nếu chứa DSN/token.
7. Debug mode vẫn dùng redactor.
8. Resource read không được trả raw provider config.
9. Admin config view nếu có phải mask, ví dụ `ghp_****abcd`.
10. Permission/policy chạy server-side nên prompt injection không thể gọi tool bí mật.

## 6. Forbidden tools by default

Không tạo mặc định các tool sau:

- `show_env`
- `show_config`
- `read_secret`
- `shell.execute`
- `postgres.query_write`
- `postgres.drop_table`
- `github.delete_repository`
- `kubernetes.delete_namespace`

Destructive tools chỉ được thêm khi có explicit dangerous mode, RBAC, policy và human approval.

## 7. Permission flow

```text
Tool Call
  -> identify user/tenant/role
  -> resolve provider + connection_id + environment
  -> check deny rules first
  -> check allow rules
  -> apply risk-level requirements
  -> require approval if HIGH/CRITICAL or outbound-tainted flow
  -> produce permission decision
```

Deny luôn thắng allow.

## 8. Policy flow

```text
Tool Call
  -> Auth Check
  -> Permission Check
  -> Policy Evaluation
  -> Input Validation
  -> Secret Resolve
  -> Provider Call
  -> Output Sanitization
  -> Audit Log
```

Policy examples:

- Không cho SQL chứa `DROP`, `DELETE`, `TRUNCATE`, `ALTER` nếu connection readonly.
- Không cho `SELECT` vượt `max_rows`.
- Không cho đọc bảng/column sensitive nếu user không có permission.
- Không cho GitHub delete repo nếu chưa approval.
- Không cho Slack send message vào channel production incident nếu user không có role `incident_manager`.
- Không cho Kubernetes delete pod ở namespace production nếu chưa approval.

## 9. Dangerous tool prevention

HIGH và CRITICAL tools phải support human approval.

Approval payload phải hiển thị:

- tool sẽ gọi
- provider
- connection_id
- risk level
- sanitized arguments
- reason
- data classification
- policy decision
- prompt injection warning nếu có

## 10. Output redaction strategy

Output Sanitizer phải redact:

- API key, access token, refresh token
- JWT
- private key
- password
- database URL / DSN
- cookie
- authorization header
- secret env var
- SSH key
- GitHub token
- Slack token
- AWS key
- GCP credential
- Kubernetes token

Nếu output chứa instruction đáng ngờ, preserve như quoted data hoặc warning; không coi là instruction.

## 11. Audit strategy

Audit log ghi:

- request_id
- correlation_id
- timestamp
- tenant_id
- user_id
- provider
- connection_id
- tool_name
- input summary đã sanitize
- output summary đã sanitize
- permission decision
- policy decision
- execution status
- duration_ms
- error_code nếu có

Audit log không ghi secret value hoặc full raw response có dữ liệu sensitive.

## 12. Prompt injection enforcement

Prompt injection defense không chỉ là lời nhắc. Nó được enforce bằng:

- server-side authorization
- policy engine
- tainted data metadata
- outbound DLP
- prompt injection scanner
- metadata validation
- human approval cho flow nguy hiểm

Chi tiết xem `docs/prompt-injection-defense.md`.
