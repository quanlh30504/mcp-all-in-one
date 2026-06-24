# ADR 0001: Plugin Provider Architecture

## Status

Accepted

## Context

`mcp-all-in-one` cần hỗ trợ nhiều provider mà không hard-code provider cụ thể vào core.

## Decision

Dùng plugin/module architecture:

- Core định nghĩa `MCPProvider`, `ProviderManifest`, registries và middleware.
- Provider nằm trong `src/providers/<name>`.
- Provider export manifest và factory.
- Tool metadata được validate trước khi registry expose.

## Consequences

Pros:

- Dễ thêm provider mới.
- Core nhỏ, ổn định.
- Security policy áp dụng đồng nhất.

Cons:

- Cần manifest validation nghiêm ngặt.
- Cần approval/diff cho metadata change.
