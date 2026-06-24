# ADR 0003: Tainted Data Policy

## Status

Accepted

## Context

Indirect prompt injection có thể dùng dữ liệu từ provider để dụ LLM gọi tool khác nhằm exfiltrate dữ liệu.

## Decision

- Mọi provider result từ nguồn external gắn `tainted=true`.
- Tool result có `classification` và `trust_level`.
- Policy Engine dùng taint metadata để require approval/block outbound tools.
- Outbound payload đi qua DLP/redaction.

## Consequences

Pros:

- Chặn cross-tool exfiltration bằng server-side policy.
- Không phụ thuộc vào model “nghe lời”.

Cons:

- Cần context propagation.
- Có thể phát sinh approval friction cho workflow hợp lệ.
