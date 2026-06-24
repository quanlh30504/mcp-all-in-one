import type { MCPToolDefinition } from '../../core/provider/types.js';

export const githubTools: MCPToolDefinition[] = [
  {
    name: 'github.list_repositories',
    description: 'List repositories visible to an allowed GitHub account and allowlist. Does not expose tokens.',
    inputSchema: { type: 'object', required: ['account_id'], properties: { account_id: { type: 'string' }, owner: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { repositories: { type: 'array', items: { type: 'object' } } } },
    permission: { provider: 'github', action: 'read:metadata', requiresAccount: true },
    riskLevel: 'LOW',
    timeoutMs: 5000,
    retry: { maxAttempts: 1, backoffMs: 250 },
    outputClassification: 'INTERNAL'
  },
  {
    name: 'github.search_code',
    description: 'Search code in allowed GitHub repositories. Returned code snippets are untrusted external content and are scanned/redacted.',
    inputSchema: { type: 'object', required: ['account_id', 'query'], properties: { account_id: { type: 'string' }, query: { type: 'string' }, owner: { type: 'string' }, repo: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { results: { type: 'array', items: { type: 'object' } } } },
    permission: { provider: 'github', action: 'read:code', requiresAccount: true },
    riskLevel: 'MEDIUM',
    timeoutMs: 10000,
    retry: { maxAttempts: 1, backoffMs: 500 },
    rateLimit: { requests: 20, windowSeconds: 60 },
    outputClassification: 'INTERNAL'
  },
  {
    name: 'github.get_file',
    description: 'Read a file from an allowed GitHub repository and branch. File content is untrusted external content and may be tainted.',
    inputSchema: { type: 'object', required: ['account_id', 'owner', 'repo', 'path'], properties: { account_id: { type: 'string' }, owner: { type: 'string' }, repo: { type: 'string' }, path: { type: 'string' }, ref: { type: 'string', default: 'main' } } },
    outputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, encoding: { type: 'string' } } },
    permission: { provider: 'github', action: 'read:file', requiresAccount: true },
    riskLevel: 'MEDIUM',
    timeoutMs: 10000,
    retry: { maxAttempts: 1, backoffMs: 500 },
    outputClassification: 'INTERNAL'
  },
  {
    name: 'github.get_pull_request',
    description: 'Read pull request metadata and diff summary from an allowed GitHub repository.',
    inputSchema: { type: 'object', required: ['account_id', 'owner', 'repo', 'pull_number'], properties: { account_id: { type: 'string' }, owner: { type: 'string' }, repo: { type: 'string' }, pull_number: { type: 'integer' } } },
    outputSchema: { type: 'object', properties: { pull_request: { type: 'object' } } },
    permission: { provider: 'github', action: 'read:pull_request', requiresAccount: true },
    riskLevel: 'MEDIUM',
    timeoutMs: 10000,
    retry: { maxAttempts: 1, backoffMs: 500 },
    outputClassification: 'INTERNAL'
  },
  {
    name: 'github.list_issues',
    description: 'List issues from an allowed GitHub repository. Issue content is untrusted external content.',
    inputSchema: { type: 'object', required: ['account_id', 'owner', 'repo'], properties: { account_id: { type: 'string' }, owner: { type: 'string' }, repo: { type: 'string' }, state: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' } } },
    outputSchema: { type: 'object', properties: { issues: { type: 'array', items: { type: 'object' } } } },
    permission: { provider: 'github', action: 'read:issue', requiresAccount: true },
    riskLevel: 'MEDIUM',
    timeoutMs: 10000,
    retry: { maxAttempts: 1, backoffMs: 500 },
    outputClassification: 'INTERNAL'
  }
];
