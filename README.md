# mcp-all-in-one

MCP server dạng modular monolith để kết nối nhiều provider qua một gateway có
permission, policy, secret boundary, output sanitization và audit thống nhất.

Server hiện chạy MCP qua stdio và có các provider:

- **Redash**: implementation hoàn chỉnh để đọc query metadata, cached results,
  refresh/poll query results, query allowlist và giới hạn output.
- **PostgreSQL**: scaffold metadata/tool policy; adapter database vẫn là TODO.
- **GitHub**: scaffold read-only tools; adapter API vẫn là TODO.

## Chạy nhanh với Redash và Docker

```bash
cp .env.example .env
# Sửa REDASH_URL, REDASH_API_KEY, REDASH_QUERY_ALLOWLIST trong .env
docker compose build
docker compose run --rm -T mcp-server
```

Lệnh cuối là MCP stdio process nên sẽ chờ JSON-RPC trên stdin, không in menu
interactive. Bình thường MCP client sẽ start process này.

## Chạy native

```bash
npm ci
npm run typecheck
npm test
npm run build

export REDASH_URL=https://redash.example.com
export REDASH_API_KEY=your-key
export REDASH_QUERY_ALLOWLIST=123,456
npm start
```

## Tài liệu

- [Setup server và cấu hình MCP clients](docs/setup-and-client-guide.md)
- [Redash provider](src/providers/redash/README.md)
- [Configuration](docs/configuration-guide.md)
- [Provider development](docs/provider-development-guide.md)
- [Architecture](docs/architecture.md)
- [Security model](docs/security-model.md)

## Kiểm tra

```bash
npm run typecheck
npm test
npm run build
```

Config và secret tuân theo nguyên tắc: YAML chỉ chứa `*_ref`; secret thật được
resolve server-side và không được trả về MCP result, log hoặc audit record.
