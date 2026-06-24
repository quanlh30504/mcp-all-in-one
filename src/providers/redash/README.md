# Redash Provider

Read-only Redash integration with query allowlists and bounded output.

## Tools

- `redash.list_connections` — list connection IDs without URLs or secrets.
- `redash.get_query` — read metadata for an allowlisted query.
- `redash.get_cached_query_results` — read cached rows without execution.
- `redash.fetch_query_results` — refresh, poll, and return bounded rows.

## API behavior

The provider prefers the documented `POST /api/queries/<id>/results` API. In
`api_mode: auto`, HTTP 404 falls back to the legacy
`POST /api/queries/<id>/refresh` behavior used by older deployments. A refresh
403 can fall back to cached results when `cached_fallback_enabled` is true.

## Security profile

- API keys are resolved lazily through `api_key_ref` and never returned.
- Every query must match `query_allowlist`; use `['*']` only when intentional.
- Returned rows are classified `CONFIDENTIAL` and tainted/untrusted.
- `max_rows`, request timeout, and maximum job wait are enforced server-side.
- HTTP redirects are rejected so the Authorization header cannot follow a
  redirect to a different host.
- The provider exposes no query mutation, dashboard mutation, or arbitrary SQL
  tool.
