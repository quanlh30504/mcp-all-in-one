import type { SecretResolver as SecretResolverInterface } from '../provider/types.js';
import { ResolvedSecret } from '../provider/types.js';

export interface SecretSource {
  canResolve(ref: string): boolean;
  resolve(ref: string): Promise<ResolvedSecret>;
}

export class SecretResolver implements SecretResolverInterface {
  constructor(private readonly sources: SecretSource[]) {}

  async resolve(ref: string): Promise<ResolvedSecret> {
    const source = this.sources.find((candidate) => candidate.canResolve(ref));
    if (!source) throw new Error(`Unsupported secret reference: ${maskSecretRef(ref)}`);
    return source.resolve(ref);
  }
}

export function maskSecretRef(ref: string): string {
  const [scheme, rest] = ref.split(':', 2);
  if (!rest) return '[INVALID_SECRET_REF]';
  return `${scheme}:****${rest.slice(-4)}`;
}
