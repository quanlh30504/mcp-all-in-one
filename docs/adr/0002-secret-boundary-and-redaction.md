# ADR 0002: Secret Boundary and Redaction

## Status

Accepted

## Context

MCP server phải kết nối provider bằng secret nhưng LLM không được thấy token/password.

## Decision

- Config chỉ chứa `secret_ref`.
- Secret Resolver là boundary duy nhất để resolve secret.
- Secret chỉ truyền đến Provider Adapter runtime.
- Không có MCP tool/resource đọc config/env/secret.
- Output/error/log/audit đều qua redactor.

## Consequences

Pros:

- Giảm nguy cơ secret leakage.
- Dễ thay đổi secret backend.

Cons:

- Provider phải tuân thủ interface và không log secret.
- Debugging cần công cụ mask an toàn.
