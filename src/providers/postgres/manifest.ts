import type { ProviderManifest } from '../../core/provider/types.js';
import { postgresTools } from './tools.js';

export const postgresManifest: ProviderManifest = {
  name: 'postgres',
  type: 'postgres',
  version: '0.2.0',
  requiredSecretRefs: ['connections.*.username_ref', 'connections.*.password_ref'],
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
            port: { type: 'integer', minimum: 1, maximum: 65535 },
            database: { type: 'string' },
            username_ref: { type: 'string' },
            password_ref: { type: 'string' },
            readonly: { const: true },
            ssl: {
              anyOf: [
                { type: 'boolean' },
                {
                  type: 'object',
                  properties: {
                    reject_unauthorized: { type: 'boolean', default: true },
                    ca_ref: { type: 'string' },
                    servername: { type: 'string' }
                  },
                  additionalProperties: false
                }
              ]
            },
            max_rows: { type: 'integer', minimum: 1, maximum: 10000, default: 100 },
            max_query_length: { type: 'integer', minimum: 1, maximum: 1000000, default: 50000 },
            statement_timeout_ms: { type: 'integer', minimum: 100, maximum: 120000, default: 5000 },
            lock_timeout_ms: { type: 'integer', minimum: 1, maximum: 30000, default: 1000 },
            connect_timeout_ms: { type: 'integer', minimum: 100, maximum: 60000, default: 5000 },
            schemas_allowlist: { type: 'array', items: { type: 'string' }, minItems: 1 },
            table_allowlist: { type: 'array', items: { type: 'string' } },
            table_denylist: { type: 'array', items: { type: 'string' } },
            column_denylist: { type: 'array', items: { type: 'string' } },
            blocked_functions: { type: 'array', items: { type: 'string' } },
            column_redaction: {
              type: 'array',
              items: {
                type: 'object',
                required: ['pattern', 'replacement'],
                properties: { pattern: { type: 'string' }, replacement: { type: 'string' } },
                additionalProperties: false
              }
            }
          },
          additionalProperties: false
        }
      }
    },
    additionalProperties: true
  },
  tools: postgresTools
};
