export type AuditSeverity = "info" | "warn" | "error";

export interface AuditIssue {
  id: string;
  rule: string;
  severity: AuditSeverity;
  message: string;
  line?: number;
  autoFixable: boolean;
}

export interface AuditReport {
  passed: boolean;
  issues: AuditIssue[];
  notes: string[];
  finalCode: string;
  healed: boolean;
}

/** G2 Auditor — static analysis for syntax, OWASP, Tailwind heuristics */
export function auditCode(code: string, language: string): AuditReport {
  const issues: AuditIssue[] = [];
  const lines = code.split("\n");

  const push = (
    rule: string,
    severity: AuditSeverity,
    message: string,
    line?: number,
    autoFixable = false,
  ) => {
    issues.push({
      id: `${rule}-${issues.length}`,
      rule,
      severity,
      message,
      line,
      autoFixable,
    });
  };

  // --- Syntax / structure ---
  const open = (code.match(/\{/g) || []).length;
  const close = (code.match(/\}/g) || []).length;
  if (open !== close) {
    push("syntax-braces", "error", `Unbalanced braces ({ ${open} vs } ${close})`);
  }
  const openParen = (code.match(/\(/g) || []).length;
  const closeParen = (code.match(/\)/g) || []).length;
  if (openParen !== closeParen) {
    push("syntax-parens", "error", `Unbalanced parentheses`);
  }

  if (language === "typescript" || language === "tsx" || language === "javascript") {
    if (!/export\s+default/.test(code) && !/module\.exports/.test(code)) {
      push("export-default", "warn", "No default export found for React entry file");
    }
  }

  // --- OWASP Top 10 heuristics ---
  lines.forEach((line, i) => {
    const n = i + 1;
    if (/\beval\s*\(/.test(line)) {
      push("owasp-a03", "error", "eval() detected — code injection risk (A03 Injection)", n);
    }
    if (/new\s+Function\s*\(/.test(line)) {
      push("owasp-a03", "error", "new Function() detected — dynamic code execution", n);
    }
    if (/dangerouslySetInnerHTML/.test(line)) {
      push(
        "owasp-a03",
        "error",
        "dangerouslySetInnerHTML without sanitizer — XSS risk",
        n,
      );
    }
    if (/\.innerHTML\s*=/.test(line)) {
      push("owasp-a03", "error", "innerHTML assignment — XSS risk", n, true);
    }
    if (/document\.write\s*\(/.test(line)) {
      push("owasp-a03", "warn", "document.write is unsafe in modern apps", n);
    }
    if (/localStorage\.setItem\([^,]+,\s*(password|token|secret)/i.test(line)) {
      push("owasp-a02", "error", "Sensitive data written to localStorage (A02 Crypto)", n);
    }
    if (/http:\/\/(?!localhost|127\.0\.0\.1)/.test(line)) {
      push("owasp-a02", "warn", "Insecure HTTP URL — prefer HTTPS", n, true);
    }
    if (/api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i.test(line)) {
      push("owasp-a07", "error", "Hard-coded API key detected (A07 Auth Failures)", n);
    }
  });

  // --- Tailwind / styling ---
  const classMatches = code.matchAll(/className=\{?`([^`]+)`\}?|className="([^"]+)"/g);
  for (const m of classMatches) {
    const classes = (m[1] || m[2] || "").split(/\s+/);
    for (const c of classes) {
      if (!c) continue;
      // broken arbitrary value: bg-[#fff (unclosed)
      if (/\[[^\]]*$/.test(c) || (/^\[/.test(c) && !/\]$/.test(c) && c.includes("["))) {
        if (c.includes("[") && !c.includes("]")) {
          push("tailwind-arbitrary", "error", `Unclosed Tailwind arbitrary value: ${c}`, undefined, true);
        }
      }
      // common typo
      if (c === "flex-center" || c === "center-flex") {
        push("tailwind-typo", "warn", `Non-standard utility "${c}" — use flex items-center justify-center`, undefined, true);
      }
    }
  }

  // Prefer Warm Brutalism tokens when raw purple AI-slop appears
  if (/#(7c3aed|8b5cf6|a855f7|6366f1)\b/i.test(code)) {
    push(
      "design-tokens",
      "warn",
      "Purple accent detected — Cozy Warm Brutalism prefers terracotta #D96B43",
      undefined,
      true,
    );
  }

  const errors = issues.filter((i) => i.severity === "error");
  const notes = [
    ...issues
      .filter((i) => i.severity === "info" || i.severity === "warn")
      .map((i) => `${i.severity.toUpperCase()}: ${i.message}`),
    errors.length === 0
      ? "OWASP static scan: no critical issues"
      : `${errors.length} critical issue(s) found`,
    "Tailwind class scan complete",
    "Export / syntax structure checked",
  ];

  return {
    passed: errors.length === 0,
    issues,
    notes,
    finalCode: code,
    healed: false,
  };
}

/** Auto-heal common G2 findings via deterministic rewrites */
export function autoHealCode(code: string, issues: AuditIssue[]): { code: string; fixed: string[] } {
  let next = code;
  const fixed: string[] = [];

  for (const issue of issues) {
    if (!issue.autoFixable) continue;
    if (issue.rule === "owasp-a03" && issue.message.includes("innerHTML")) {
      next = next.replace(/\.innerHTML\s*=\s*([^;]+);/g, ".textContent = $1;");
      fixed.push("Replaced innerHTML with textContent");
    }
    if (issue.rule === "owasp-a02" && issue.message.includes("HTTP")) {
      next = next.replace(/http:\/\/(?!localhost|127\.0\.0\.1)/g, "https://");
      fixed.push("Upgraded http:// to https://");
    }
    if (issue.rule === "design-tokens") {
      next = next
        .replace(/#7c3aed/gi, "#D96B43")
        .replace(/#8b5cf6/gi, "#D96B43")
        .replace(/#a855f7/gi, "#C85A32")
        .replace(/#6366f1/gi, "#D96B43");
      fixed.push("Mapped purple accents to terracotta");
    }
    if (issue.rule === "tailwind-typo") {
      next = next.replace(/\bflex-center\b/g, "flex items-center justify-center");
      next = next.replace(/\bcenter-flex\b/g, "flex items-center justify-center");
      fixed.push("Normalized flex centering utilities");
    }
  }

  return { code: next, fixed };
}
