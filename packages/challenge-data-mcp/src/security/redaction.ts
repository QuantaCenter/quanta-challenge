const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi, 'Bearer [REDACTED]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_JWT]'],
  [/(password|passwd|secret|access[_-]?token|refresh[_-]?token|api[_-]?key)(["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, '$1$2[REDACTED]'],
  [/\b(?:sk|pk)_[A-Za-z0-9_-]{16,}\b/g, '[REDACTED_KEY]'],
];

export function redactText(value: string): string {
  return SECRET_PATTERNS.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    value,
  );
}

export function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        /password|secret|token|api.?key/i.test(key) ? '[REDACTED]' : redactValue(child),
      ]),
    );
  }
  return value;
}

export function boundedJson(value: unknown, maxBytes: number): string {
  const json = JSON.stringify(redactValue(value), jsonReplacer, 2);
  if (Buffer.byteLength(json) <= maxBytes) return json;
  const suffix = '\n…结果因体积限制已截断';
  return Buffer.from(json).subarray(0, Math.max(0, maxBytes - Buffer.byteLength(suffix))).toString() + suffix;
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  return value;
}
