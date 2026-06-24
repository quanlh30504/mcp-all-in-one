export type PromptInjectionDecision = 'ALLOW' | 'ALLOW_WITH_WARNING' | 'REQUIRE_HUMAN_APPROVAL' | 'BLOCK';

export interface PromptInjectionScanResult {
  decision: PromptInjectionDecision;
  reasons: string[];
}

const BLOCK_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /reveal\s+(the\s+)?(system\s+prompt|secrets?|tokens?|passwords?)/i,
  /print\s+(env|environment\s+variables)/i,
  /bypass\s+(permission|policy|security)/i,
  /disable\s+(security|redaction|audit)/i,
  /exfiltrate/i,
  /send\s+.*(token|secret|password).*https?:\/\//i,
  /call\s+(another\s+)?tool/i
];

const WARNING_PATTERNS = [
  /<[^>]+style=["'][^"']*display\s*:\s*none/i,
  /<!--([\s\S]*?)(ignore|secret|token|tool)([\s\S]*?)-->/i,
  /[\u200B-\u200D\uFEFF]/,
  /https?:\/\/[^\s]+/i,
  /base64/i
];

export class PromptInjectionScanner {
  scanText(text: string, options?: { source?: string; highRisk?: boolean }): PromptInjectionScanResult {
    const reasons: string[] = [];

    for (const pattern of BLOCK_PATTERNS) {
      if (pattern.test(text)) reasons.push(`Matched suspicious instruction pattern: ${pattern}`);
    }

    if (looksLikeSuspiciousBase64(text)) {
      reasons.push('Contains base64-like payload with suspicious decoded content.');
    }

    if (reasons.length) {
      return {
        decision: options?.highRisk ? 'BLOCK' : 'REQUIRE_HUMAN_APPROVAL',
        reasons
      };
    }

    const warnings: string[] = [];
    for (const pattern of WARNING_PATTERNS) {
      if (pattern.test(text)) warnings.push(`Matched warning pattern: ${pattern}`);
    }

    if (warnings.length) return { decision: 'ALLOW_WITH_WARNING', reasons: warnings };
    return { decision: 'ALLOW', reasons: [] };
  }
}

function looksLikeSuspiciousBase64(text: string): boolean {
  const candidates = text.match(/[A-Za-z0-9+/]{32,}={0,2}/g) ?? [];
  for (const candidate of candidates.slice(0, 10)) {
    try {
      const decoded = Buffer.from(candidate, 'base64').toString('utf8');
      if (/ignore previous|reveal secret|send token|print env|bypass policy/i.test(decoded)) return true;
    } catch {
      // Ignore invalid base64.
    }
  }
  return false;
}
