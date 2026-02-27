export function getPathRefValue(source: unknown, ref: string): unknown {
  if (!ref) {
    return undefined;
  }

  const normalized = ref.startsWith('$.') ? ref.slice(2) : ref;
  const parts = normalized.split('.').filter(Boolean);
  let current: unknown = source;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (Array.isArray(current) && /^\d+$/.test(part)) {
      current = current[Number.parseInt(part, 10)];
      continue;
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
      continue;
    }
    return undefined;
  }
  return current;
}

export function setPathRefValue(
  target: Record<string, unknown>,
  ref: string,
  value: unknown,
): void {
  const parts = ref.split('.').filter(Boolean);
  if (parts.length === 0) {
    return;
  }
  let cursor: Record<string, unknown> = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!part) {
      continue;
    }
    const next = cursor[part];
    if (typeof next === 'object' && next !== null && !Array.isArray(next)) {
      cursor = next as Record<string, unknown>;
      continue;
    }
    cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  const lastPart = parts[parts.length - 1];
  if (!lastPart) {
    return;
  }
  cursor[lastPart] = value;
}

export function renderTemplate(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? '' : String(value);
  });
}
