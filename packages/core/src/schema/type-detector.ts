import type { ObservedValueKind, TypeObservation } from './types.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.+-Z]+)?$/;
const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isTableLikeValue(value: unknown): value is {
  headers: unknown;
  rows: unknown;
  rowCount?: unknown;
} {
  if (!isPlainObject(value)) {
    return false;
  }
  return Array.isArray(value.headers) && Array.isArray(value.rows);
}

export class TypeDetector {
  detectKind(value: unknown): ObservedValueKind {
    if (value === null) {
      return 'null';
    }
    if (isTableLikeValue(value)) {
      return 'table';
    }
    if (Array.isArray(value)) {
      return 'array';
    }
    if (typeof value === 'string') {
      if (URL_RE.test(value)) {
        return 'url';
      }
      if (ISO_DATE_RE.test(value)) {
        return 'date';
      }
      return 'string';
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return 'number';
    }
    if (typeof value === 'boolean') {
      return 'boolean';
    }
    if (isPlainObject(value)) {
      return 'object';
    }
    return 'unknown';
  }

  detectPrimitiveType(
    value: unknown,
  ): 'string' | 'number' | 'boolean' | 'date' | 'url' | 'unknown' {
    const kind = this.detectKind(value);
    if (
      kind === 'string' ||
      kind === 'number' ||
      kind === 'boolean' ||
      kind === 'date' ||
      kind === 'url'
    ) {
      return kind;
    }
    return 'unknown';
  }

  observe(values: unknown[]): TypeObservation {
    const unique = new Set<string>();
    let nullCount = 0;
    let emptyCount = 0;
    let min: number | undefined;
    let max: number | undefined;
    const formatHints = new Set<'date' | 'url'>();

    for (const value of values) {
      if (value === null || value === undefined) {
        nullCount += 1;
        continue;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
          emptyCount += 1;
        }
        unique.add(trimmed);
        if (ISO_DATE_RE.test(trimmed)) {
          formatHints.add('date');
        }
        if (URL_RE.test(trimmed)) {
          formatHints.add('url');
        }
        continue;
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        unique.add(String(value));
        min = min === undefined ? value : Math.min(min, value);
        max = max === undefined ? value : Math.max(max, value);
        continue;
      }
      if (typeof value === 'boolean') {
        unique.add(String(value));
        continue;
      }
      unique.add(Object.prototype.toString.call(value));
    }

    const base: TypeObservation = {
      count: values.length,
      nullCount,
      emptyCount,
      uniqueValues: [...unique].slice(0, 50),
      formatHints: [...formatHints],
    };
    if (min !== undefined) {
      base.min = min;
    }
    if (max !== undefined) {
      base.max = max;
    }
    return base;
  }
}
