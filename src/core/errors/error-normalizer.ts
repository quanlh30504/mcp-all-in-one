import { redactText } from '../security/output-sanitizer.js';

export interface NormalizedError {
  code: string;
  message: string;
}

export function normalizeError(error: unknown): NormalizedError {
  const message = error instanceof Error ? error.message : String(error);
  return {
    code: 'INTERNAL_ERROR',
    message: redactText(message)
  };
}
