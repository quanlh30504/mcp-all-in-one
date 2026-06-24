# PostgreSQL Provider

## Tools

- `postgres.list_connections` LOW
- `postgres.list_schemas` LOW
- `postgres.list_tables` LOW
- `postgres.describe_table` LOW
- `postgres.query_readonly` MEDIUM
- `postgres.explain_query` LOW

## Security profile

- Default readonly.
- No multi-statement SQL.
- Only SELECT/WITH/EXPLAIN.
- Block DROP/DELETE/INSERT/UPDATE/ALTER/TRUNCATE/CREATE.
- Enforce LIMIT/max_rows.
- Apply statement timeout.
- Connection-level allowlist.
- Table/column denylist.
- Redact sensitive columns.
- Never expose connection string, username, password.

## Implementation TODO

- Add `pg` dependency.
- Create connection pool per connection_id.
- Resolve username/password via Secret Resolver at runtime.
- Implement SQL parser/validator.
- Implement row/column sanitizer.
- Add integration tests with readonly database user.
