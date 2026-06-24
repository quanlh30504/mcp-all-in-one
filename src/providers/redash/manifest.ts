import type { ProviderManifest } from '../../core/provider/types.js';
import { redashTools } from './tools.js';

export const redashManifest: ProviderManifest = {
  name: 'redash',
  type: 'redash',
  version: '0.1.0',
  requiredSecretRefs: ['connections.*.api_key_ref'],
  configSchema: {
    type: 'object',
    required: ['connections'],
    properties: {
      connections: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          required: ['base_url', 'api_key_ref', 'query_allowlist'],
          properties: {
            base_url: { type: 'string', format: 'uri' },
            api_key_ref: { type: 'string' },
            query_allowlist: { type: 'array', items: { anyOf: [{ type: 'integer' }, { const: '*' }] } },
            max_rows: { type: 'integer', minimum: 1, maximum: 10000, default: 500 },
            max_wait_seconds: { type: 'integer', minimum: 1, maximum: 600, default: 120 },
            request_timeout_ms: { type: 'integer', minimum: 100, maximum: 120000, default: 15000 },
            refresh_enabled: { type: 'boolean', default: true },
            cached_fallback_enabled: { type: 'boolean', default: true },
            api_mode: { type: 'string', enum: ['auto', 'results', 'legacy_refresh'], default: 'auto' }
          },
          additionalProperties: false
        }
      }
    },
    additionalProperties: true
  },
  tools: redashTools
};
