# GitHub Provider

## MVP tools

- `github.list_repositories` LOW
- `github.search_code` MEDIUM
- `github.get_file` MEDIUM
- `github.get_pull_request` MEDIUM
- `github.list_issues` MEDIUM

## Security profile

- Token scope tối thiểu.
- Repo allowlist.
- Branch allowlist.
- Write tools disabled by default.
- Delete repository disabled by default.
- File/issue/PR content is untrusted external data.
- Output redaction for secret patterns.
- Tainted output requires approval before outbound transfer.

## Implementation TODO

- Add GitHub API client.
- Resolve account token via Secret Resolver at execution time.
- Enforce repo/branch allowlist.
- Scan code/file output for secrets and prompt injection.
- Add pagination and rate limit handling.
