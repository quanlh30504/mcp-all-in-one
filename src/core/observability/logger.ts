import { OutputSanitizer } from '../security/output-sanitizer.js';

export class Logger {
  private readonly sanitizer = new OutputSanitizer();

  info(message: string, fields: Record<string, unknown> = {}): void {
    // stdout is reserved for MCP stdio JSON-RPC frames.
    process.stderr.write(JSON.stringify({ level: 'info', message, ...this.sanitizer.sanitize(fields) }) + '\n');
  }

  error(message: string, fields: Record<string, unknown> = {}): void {
    process.stderr.write(JSON.stringify({ level: 'error', message, ...this.sanitizer.sanitize(fields) }) + '\n');
  }
}
