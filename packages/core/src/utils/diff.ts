import { stableJsonStringify } from './stable-json.js';

export interface WorkflowDiffEntry {
  kind: 'added' | 'removed' | 'changed';
  path: string;
  before?: unknown;
  after?: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function diffObjects(a: unknown, b: unknown, path = ''): WorkflowDiffEntry[] {
  if (stableJsonStringify(a) === stableJsonStringify(b)) {
    return [];
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    return [{ kind: 'changed', path: path || '$', before: a, after: b }];
  }

  if (!isObject(a) || !isObject(b)) {
    return [{ kind: 'changed', path: path || '$', before: a, after: b }];
  }

  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const entries: WorkflowDiffEntry[] = [];
  for (const key of [...keys].sort()) {
    const nextPath = path ? `${path}.${key}` : key;
    if (!(key in a)) {
      entries.push({ kind: 'added', path: nextPath, after: b[key] });
      continue;
    }
    if (!(key in b)) {
      entries.push({ kind: 'removed', path: nextPath, before: a[key] });
      continue;
    }
    entries.push(...diffObjects(a[key], b[key], nextPath));
  }
  return entries;
}
