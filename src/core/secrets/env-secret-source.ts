import { ResolvedSecret } from '../provider/types.js';
import type { SecretSource } from './secret-resolver.js';

export class EnvSecretSource implements SecretSource {
  canResolve(ref: string): boolean {
    return ref.startsWith('env:');
  }

  async resolve(ref: string): Promise<ResolvedSecret> {
    const name = ref.slice('env:'.length);
    if (!/^[A-Z0-9_]+$/.test(name)) {
      throw new Error('Invalid environment secret reference');
    }
    const value = process.env[name];
    if (!value) {
      throw new Error(`Missing environment secret: env:****${name.slice(-4)}`);
    }
    return new ResolvedSecret(value);
  }
}
