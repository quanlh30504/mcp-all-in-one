import { access } from 'node:fs/promises';
import { loadYamlConfig } from './config-loader.js';

export interface ProviderFileConfig {
  providers?: Record<string, ProviderEntryConfig>;
}

export interface ProviderEntryConfig extends Record<string, unknown> {
  enabled?: boolean;
  type?: string;
  version?: string;
}

export async function loadProviderEntries(): Promise<Record<string, ProviderEntryConfig>> {
  const explicitPath = process.env.MCP_CONFIG_PATH;
  const defaultPath = 'configs/providers.yaml';
  const path = explicitPath ?? (await exists(defaultPath) ? defaultPath : undefined);

  if (path) {
    const config = await loadYamlConfig<ProviderFileConfig>(path);
    return config.providers ?? {};
  }

  return redashConfigFromEnvironment();
}

function redashConfigFromEnvironment(): Record<string, ProviderEntryConfig> {
  if (!process.env.REDASH_URL || !process.env.REDASH_API_KEY) return {};

  const queryAllowlist = (process.env.REDASH_QUERY_ALLOWLIST ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value === '*' ? value : Number(value))
    .filter((value) => value === '*' || Number.isSafeInteger(value));

  return {
    redash: {
      enabled: true,
      type: 'redash',
      connections: {
        default: {
          base_url: process.env.REDASH_URL,
          api_key_ref: 'env:REDASH_API_KEY',
          query_allowlist: queryAllowlist.length ? queryAllowlist : [],
          max_rows: integerFromEnvironment('REDASH_MAX_ROWS', 500),
          max_wait_seconds: integerFromEnvironment('REDASH_MAX_WAIT_SECONDS', 120),
          request_timeout_ms: integerFromEnvironment('REDASH_REQUEST_TIMEOUT_MS', 15000),
          refresh_enabled: process.env.REDASH_REFRESH_ENABLED !== 'false',
          cached_fallback_enabled: process.env.REDASH_CACHED_FALLBACK_ENABLED !== 'false',
          api_mode: process.env.REDASH_API_MODE ?? 'auto'
        }
      }
    }
  };
}

function integerFromEnvironment(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
