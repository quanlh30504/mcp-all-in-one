# Roadmap

## Bước 1: Inspect repo hiện tại

Chưa có source repo thật được cung cấp trong artifact này. Vì vậy scaffold này giả định repo hiện tại trống hoặc cần thiết kế lại từ đầu. Khi có repo thật, làm inventory:

- Có package manager nào?
- Ngôn ngữ/runtime?
- Tool/provider hiện tại?
- Config hiện tại có chứa secret không?
- Có audit/permission/policy chưa?
- Có tests chưa?

## Bước 2: Tóm tắt trạng thái hiện tại

Từ yêu cầu đã cung cấp, mục tiêu repo là MCP platform multi-provider. Code thực tế chưa được inspect, nên không kết luận được implementation hiện tại.

## Bước 3: Đề xuất kiến trúc chuẩn

Kiến trúc chuẩn nằm trong:

- `docs/architecture.md`
- `docs/security-model.md`
- `docs/provider-development-guide.md`
- `docs/permission-model.md`
- `docs/prompt-injection-defense.md`

## Bước 4: Tạo/cập nhật folder structure và docs

Tạo các folder:

- `docs/`
- `docs/adr/`
- `configs/`
- `src/core/`
- `src/providers/`
- `tests/`

## Bước 5: Config examples

Tạo:

- `configs/providers.example.yaml`
- `configs/permissions.example.yaml`
- `configs/tenants.example.yaml`
- `configs/policies.example.yaml`

## Bước 6: Skeleton interface

Tạo TypeScript skeleton:

- Provider interface
- Provider manager
- Tool registry
- Config loader
- Secret resolver
- Permission engine
- Policy engine
- Audit logger
- Output sanitizer
- Prompt injection scanner
- PostgreSQL/GitHub example providers

## MVP scope

### Must have

- MCP Gateway
- stdio transport
- provider interface
- provider manager
- tool registry
- config loader
- secret resolver with `env:`
- permission middleware
- policy engine
- audit log
- output sanitizer
- prompt injection scanner
- PostgreSQL readonly provider
- GitHub read-only basic provider

### Should have

- request_id/correlation_id
- structured logging
- basic metrics counters
- config schema validation
- provider manifest validation
- tool metadata scanner
- test skeleton

### Not in MVP

- write/destructive tools
- provider marketplace
- dynamic remote MCP providers
- Kubernetes/Docker control tools
- custom HTTP POST outbound by default
- hot reload without approval workflow

## Implementation phases

### Phase 1: Secure modular monolith

1. Implement core interfaces.
2. Implement stdio MCP transport.
3. Implement provider manager.
4. Implement tool registry.
5. Implement config loader.
6. Implement env secret resolver.
7. Implement permission/policy/audit middleware.
8. Implement PostgreSQL readonly provider.
9. Implement GitHub read-only provider.
10. Add redaction and prompt injection scanner.

### Phase 2: Runtime operations

- Config reload with validation/diff.
- Provider hot reload with tool metadata approval.
- Redis cache.
- Queue for long-running tools.
- Metrics + tracing integration.

### Phase 3: Multi-tenant scale

- Remote provider workers.
- Provider execution service.
- Horizontal scaling.
- Central config store.
- Admin API.
- Per-tenant isolation hardening.

### Phase 4: Marketplace/sandbox

- Provider package registry.
- Signed manifests.
- Sandbox execution.
- Network egress policy.
- Security review workflow.

## Next implementation checklist

- [ ] Choose TypeScript runtime and lock Node version.
- [ ] Add CI with lint/typecheck/test.
- [ ] Implement `MCPProvider` and `ProviderManifest` first.
- [ ] Implement config schema validation.
- [ ] Implement `env:` Secret Resolver.
- [ ] Implement tool registry with metadata validation.
- [ ] Implement permission engine deny-first.
- [ ] Implement policy engine with SQL readonly policy.
- [ ] Implement audit logger with sanitizer.
- [ ] Implement PostgreSQL readonly provider.
- [ ] Implement GitHub read-only provider.
- [ ] Add tests for prompt injection and secret redaction.
- [ ] Add ADR for every high-impact decision.
