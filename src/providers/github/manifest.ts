import type { ProviderManifest } from '../../core/provider/types.js';
import { githubTools } from './tools.js';

export const githubManifest: ProviderManifest = {
  name: 'github',
  type: 'github',
  version: '0.1.0',
  requiredSecretRefs: [],
  configSchema: {
    type: 'object',
    required: ['accounts'],
    properties: {
      accounts: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          required: ['token_ref'],
          properties: {
            token_ref: { type: 'string' },
            default_owner: { type: 'string' },
            repo_allowlist: { type: 'array', items: { type: 'string' } },
            branch_allowlist: { type: 'array', items: { type: 'string' } },
            write_tools_enabled: { type: 'boolean', default: false },
            delete_tools_enabled: { type: 'boolean', default: false }
          }
        }
      }
    }
  },
  tools: githubTools
};
