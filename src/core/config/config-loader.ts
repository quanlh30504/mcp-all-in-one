import { readFile } from 'node:fs/promises';
import YAML from 'yaml';

export async function loadYamlConfig<T = Record<string, unknown>>(path: string): Promise<T> {
  const raw = await readFile(path, 'utf8');
  const parsed = YAML.parse(raw) as T;
  assertNoPlainSecrets(parsed);
  return parsed;
}

function assertNoPlainSecrets(value: unknown, path: string[] = []): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPlainSecrets(item, [...path, String(index)]));
    return;
  }

  if (!value || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    const currentPath = [...path, key];
    const isSecretKey = ['token', 'password', 'secret', 'private_key', 'api_key'].some((name) => lower === name);
    const isReferenceKey = lower.endsWith('_ref') || lower === 'secret_ref';

    if (isSecretKey && !isReferenceKey) {
      throw new Error(`Plain secret-like config key is not allowed: ${currentPath.join('.')}. Use *_ref instead.`);
    }

    assertNoPlainSecrets(child, currentPath);
  }
}
