export class OutputSanitizer {
  sanitize<T>(value: T): T {
    const text = JSON.stringify(value);
    const sanitized = redactText(text);
    return JSON.parse(sanitized) as T;
  }

  sanitizeText(value: string): string {
    return redactText(value);
  }
}

export function redactText(input: string): string {
  return input
    .replace(/ghp_[A-Za-z0-9_]{20,}/g, 'ghp_[REDACTED]')
    .replace(/xox[baprs]-[A-Za-z0-9-]{20,}/g, 'xox[REDACTED]')
    .replace(/AKIA[0-9A-Z]{16}/g, 'AKIA[REDACTED]')
    .replace(/-----BEGIN (RSA |EC |OPENSSH |)?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |OPENSSH |)?PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, 'postgres://[REDACTED_DSN]')
    .replace(/mysql:\/\/[^\s"']+/gi, 'mysql://[REDACTED_DSN]')
    .replace(/(Authorization\s*:\s*Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]')
    .replace(/("?(password|token|secret|api_key|private_key)"?\s*[:=]\s*")([^"\\]*(?:\\.[^"\\]*)*)"/gi, '$1[REDACTED]"');
}
