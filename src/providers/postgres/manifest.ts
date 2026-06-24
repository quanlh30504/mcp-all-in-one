import type { ProviderManifest } from '../../core/provider/types.js';
import { postgresTools } from './tools.js';

export const postgresManifest: ProviderManifest = {
  name: 'postgres',
  type: 'postgres',
  version: '0.1.0',
  requiredSecretRefs: [],
  configSchema: {
    type: 'object',
    required: ['connections'],
    properties: {
      connections: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          required: ['host', 'port', 'database', 'username_ref', 'password_ref', 'readonly'],
          properties: {
            environment: { type: 'string' },
            host: { type: 'string' },
            port: { type: 'integer' },
            database: { type: 'string' },
            username_ref: { type: 'string' },
            password_ref: { type: 'string' },
            readonly: { type: 'boolean', default: true },
            max_rows: { type: 'integer', default: 100 },
            statement_timeout_ms: { type: 'integer', default: 5000 }
          }
        }
      }
    }
  },
  tools: postgresTools
};
