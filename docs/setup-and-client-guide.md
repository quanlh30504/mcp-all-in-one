# Hướng dẫn setup MCP server và MCP clients

Guide này áp dụng cho MCP stdio server trong repo và tập trung vào Redash. Các
đường dẫn trong client config phải là **đường dẫn tuyệt đối**.

## 1. Tổng quan runtime

Client (Claude/Codex/Cursor) start một process local. Process đọc JSON-RPC từ
stdin và chỉ ghi JSON-RPC ra stdout. Log/audit được ghi vào stderr.

```text
MCP client -> stdio server -> gateway -> permission/policy -> Redash provider
           <- sanitized + tainted result <- Redash API
```

Redash provider expose bốn tools:

| Tool | Mục đích | Risk |
|---|---|---|
| `redash.list_connections` | Liệt kê connection ID, không lộ URL/key | LOW |
| `redash.get_query` | Đọc metadata của query được allow | LOW |
| `redash.get_cached_query_results` | Đọc cached rows, không trigger query | MEDIUM |
| `redash.fetch_query_results` | Refresh, poll job và đọc rows | MEDIUM |

`fetch_query_results` ưu tiên API chính thức
`POST /api/queries/<id>/results`. `api_mode: auto` fallback sang endpoint legacy
`/refresh` khi server trả 404. Nếu refresh trả 403 và cho phép fallback, provider
đọc cached result và trả warning. Redash phân biệt User API Key và Query API Key;
xem [Redash API documentation](https://redash.io/help/user-guide/integrations-and-api/api/).

## 2. Yêu cầu

Chọn một trong hai:

- Native: Node.js 22 và npm.
- Container: Docker Engine/Desktop có Docker Compose v2.

Bạn cần:

- Redash base URL, ví dụ `https://redash.company.com`.
- Redash API key.
- Danh sách query ID được phép đọc.

Query API Key có phạm vi nhỏ hơn và phù hợp khi chỉ cần cached result của một
query. Refresh và parameterized query thường cần User API Key có quyền tương
ứng. Luôn ưu tiên key có quyền tối thiểu.

## 3. Cấu hình nhanh bằng environment

```bash
cp .env.example .env
```

Sửa `.env`:

```dotenv
REDASH_URL=https://redash.company.com
REDASH_API_KEY=replace-with-real-key
REDASH_QUERY_ALLOWLIST=123,456
REDASH_MAX_ROWS=500
REDASH_MAX_WAIT_SECONDS=120
REDASH_REQUEST_TIMEOUT_MS=15000
REDASH_REFRESH_ENABLED=true
REDASH_CACHED_FALLBACK_ENABLED=true
REDASH_API_MODE=auto
```

`REDASH_QUERY_ALLOWLIST=*` cho phép mọi query mà key có thể truy cập. Chỉ dùng
khi đó thực sự là phạm vi mong muốn. Nếu biến này bị thiếu, env auto-config dùng
allowlist rỗng và từ chối mọi query. `.env` đã được `.gitignore`.

### Các mode API

- `auto`: dùng `/results`, fallback `/refresh` khi 404. Khuyến nghị.
- `results`: chỉ dùng API `/results` chính thức.
- `legacy_refresh`: chỉ dùng `/refresh`, tương thích deployment cũ.

## 4. Cấu hình YAML cho nhiều provider/connection

```bash
cp configs/providers.example.yaml configs/providers.yaml
export MCP_CONFIG_PATH=/absolute/path/to/mcp-all-in-one/configs/providers.yaml
export REDASH_API_KEY=replace-with-real-key
```

Phần Redash tối thiểu:

```yaml
providers:
  redash:
    enabled: true
    type: redash
    connections:
      analytics:
        base_url: https://redash.company.com
        api_key_ref: env:REDASH_API_KEY
        query_allowlist: [123, 456]
        max_rows: 500
        max_wait_seconds: 120
        request_timeout_ms: 15000
        refresh_enabled: true
        cached_fallback_enabled: true
        api_mode: auto
```

YAML không được chứa key thật. `api_key_ref` được resolve lazily ngay trước API
call. Nếu `MCP_CONFIG_PATH` không được set và không có
`configs/providers.yaml`, server tự tạo một Redash connection tên `default` từ
environment ở mục 3. Docker Compose mount `./configs` read-only vào container,
vì vậy `configs/providers.yaml` cũng được tự nhận trong container.

## 5. Build và chạy server

### Native

```bash
npm ci
npm run typecheck
npm test
npm run build
npm start
```

`npm start` sẽ đứng chờ input; đây là hành vi đúng của stdio server.

### Docker

```bash
docker compose build
docker compose run --rm -T mcp-server
```

Không thêm `-it`: TTY có thể làm hỏng MCP framing. Khi cấu hình client, dùng
lệnh tương đương:

```bash
docker compose -f /ABSOLUTE/PATH/mcp-all-in-one/docker-compose.yml \
  run --rm -T mcp-server
```

Compose đọc secret từ `/ABSOLUTE/PATH/mcp-all-in-one/.env`, nên API key không
cần xuất hiện trong config của từng client.

### Test bằng MCP Inspector

```bash
npx -y @modelcontextprotocol/inspector \
  docker compose -f /ABSOLUTE/PATH/mcp-all-in-one/docker-compose.yml \
  run --rm -T mcp-server
```

Chọn `redash.list_connections`, sau đó thử cached result trước:

```json
{
  "connection_id": "default",
  "query_id": 123,
  "max_rows": 10
}
```

Với YAML example, connection ID là `analytics` thay vì `default`.

## 6. Claude Desktop

Theo [MCP local server guide](https://modelcontextprotocol.io/docs/tutorials/use-local-mcp-server),
file config chính thức nằm tại:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Mở **Settings → Developer → Edit Config**, thêm:

```json
{
  "mcpServers": {
    "mcp-all-in-one": {
      "command": "docker",
      "args": [
        "compose",
        "-f",
        "/ABSOLUTE/PATH/mcp-all-in-one/docker-compose.yml",
        "run",
        "--rm",
        "-T",
        "mcp-server"
      ]
    }
  }
}
```

Nếu Claude Desktop không tìm thấy `docker`, dùng absolute executable path (ví
dụ kết quả của `which docker`). Thoát hẳn rồi mở lại Claude Desktop. Trên Linux,
dùng Claude Code hoặc client khác nếu bản Claude Desktop chính thức không có
cho hệ điều hành của bạn.

## 7. Claude Code CLI

Tài liệu chính thức:
[Connect Claude Code to tools via MCP](https://docs.anthropic.com/en/docs/claude-code/mcp).

Thêm server ở scope user:

```bash
claude mcp add mcp-all-in-one --scope user -- \
  docker compose -f /ABSOLUTE/PATH/mcp-all-in-one/docker-compose.yml \
  run --rm -T mcp-server
```

Hoặc scope project để sinh `.mcp.json` có thể share:

```bash
claude mcp add mcp-all-in-one --scope project -- \
  docker compose -f /ABSOLUTE/PATH/mcp-all-in-one/docker-compose.yml \
  run --rm -T mcp-server
```

Kiểm tra:

```bash
claude mcp list
claude mcp get mcp-all-in-one
```

Trong Claude Code, chạy `/mcp`. Project-scoped server cần được người dùng chấp
thuận trước lần sử dụng đầu tiên.

## 8. Codex CLI và Codex VS Code extension

Codex CLI và IDE extension dùng chung MCP config. Theo
[OpenAI Codex MCP documentation](https://developers.openai.com/codex/mcp), config
global là `~/.codex/config.toml`; project config là `.codex/config.toml` trong
trusted project.

### Cấu hình bằng CLI

```bash
codex mcp add mcp-all-in-one -- \
  docker compose -f /ABSOLUTE/PATH/mcp-all-in-one/docker-compose.yml \
  run --rm -T mcp-server
```

Kiểm tra:

```bash
codex mcp --help
codex
# Trong TUI: /mcp
```

### Cấu hình bằng `config.toml`

```toml
[mcp_servers.mcp_all_in_one]
command = "docker"
args = [
  "compose",
  "-f",
  "/ABSOLUTE/PATH/mcp-all-in-one/docker-compose.yml",
  "run",
  "--rm",
  "-T",
  "mcp-server",
]
startup_timeout_sec = 30
tool_timeout_sec = 650
enabled = true
required = true
default_tools_approval_mode = "prompt"
```

`tool_timeout_sec` lớn hơn `REDASH_MAX_WAIT_SECONDS` để client không ngắt job
trước server. Trong VS Code extension, mở gear menu → **MCP settings → Open
config.toml**. Restart/new session nếu tool chưa refresh.

### Chạy native thay Docker

```toml
[mcp_servers.mcp_all_in_one]
command = "node"
args = ["/ABSOLUTE/PATH/mcp-all-in-one/dist/src/index.js"]
cwd = "/ABSOLUTE/PATH/mcp-all-in-one"
env_vars = ["REDASH_URL", "REDASH_API_KEY", "REDASH_QUERY_ALLOWLIST"]
tool_timeout_sec = 650
```

Các biến trong `env_vars` phải tồn tại trong environment của process đã start
Codex/VS Code.

## 9. Cursor

Theo [Cursor MCP documentation](https://docs.cursor.com/context/model-context-protocol):

- Project config: `.cursor/mcp.json`
- Global config: `~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "mcp-all-in-one": {
      "command": "docker",
      "args": [
        "compose",
        "-f",
        "/ABSOLUTE/PATH/mcp-all-in-one/docker-compose.yml",
        "run",
        "--rm",
        "-T",
        "mcp-server"
      ]
    }
  }
}
```

Mở Cursor Settings → MCP, enable server và kiểm tra bốn Redash tools. Cursor
hỏi approval trước tool call theo mặc định; giữ approval bật cho dữ liệu nhạy
cảm.

## 10. Client MCP stdio khác

Hầu hết client dùng cùng shape:

```json
{
  "mcpServers": {
    "mcp-all-in-one": {
      "command": "docker",
      "args": ["compose", "-f", "/ABS/PATH/docker-compose.yml", "run", "--rm", "-T", "mcp-server"]
    }
  }
}
```

Ba điều bất biến: dùng absolute path, không bật TTY, và không để process khác
ghi text thường vào stdout.

## 11. Cách sử dụng

Ví dụ prompt cho client:

```text
Dùng redash.list_connections để xem connection có sẵn.
```

```text
Đọc tối đa 20 dòng cached của Redash query 123 trên connection default.
```

```text
Refresh Redash query 123 với parameters {"date": "2026-06-25"}, chờ kết quả
và chỉ trả tối đa 100 dòng.
```

Provider luôn trả metadata `tainted: true` cho nội dung Redash. Client/model
phải coi row và query metadata là data ngoài không đáng tin, không phải chỉ dẫn.

## 12. Troubleshooting

### Không thấy tool

- Chạy `docker compose build` lại sau khi đổi code.
- Kiểm tra client dùng absolute compose path.
- Kiểm tra `REDASH_URL`, `REDASH_API_KEY` và `REDASH_QUERY_ALLOWLIST` có trong
  `.env`.
- Với native mode, kiểm tra `MCP_CONFIG_PATH`; file config được ưu tiên hơn env
  auto-config.
- Restart client hoặc mở session mới.

### `Connection closed` hoặc parse JSON-RPC lỗi

- Không dùng `-it`/TTY.
- Không thêm `console.log` vào server; stdout dành riêng cho protocol.
- Chạy command trong terminal và xem lỗi từ stderr.
- Trên Windows, bảo đảm Docker Desktop đang chạy và command path hợp lệ.

### Refresh trả 403

API key có thể là Query API Key hoặc user không có quyền execute query. Khi
fallback bật, tool trả cached rows cùng warning; parameters mới không được áp
dụng. Dùng User API Key quyền tối thiểu nếu bắt buộc refresh.

### Timeout

- Tăng `REDASH_MAX_WAIT_SECONDS` (tối đa 600).
- Tăng client tool timeout cao hơn giá trị đó.
- `REDASH_REQUEST_TIMEOUT_MS` chỉ áp dụng cho từng HTTP request, không phải toàn
  bộ polling job.

### Query bị từ chối

Thêm ID vào `REDASH_QUERY_ALLOWLIST` hoặc `query_allowlist` đúng connection.
Không dùng wildcard chỉ để “sửa nhanh” trong production.

## 13. Production checklist

- Dùng HTTPS cho Redash.
- Dùng API key quyền tối thiểu và rotate định kỳ.
- Dùng allowlist query ID rõ ràng.
- Giữ `max_rows` nhỏ và phù hợp dữ liệu.
- Không commit `.env` hoặc `configs/providers.yaml` cá nhân.
- Giữ tool approval phía client cho MEDIUM risk.
- Thu thập stderr/audit bằng log sink bảo mật; không redirect stderr vào stdout.
- PostgreSQL/GitHub hiện vẫn là scaffold, không coi output của chúng là dữ liệu
  production cho đến khi adapter TODO được implement.
