import stableStringify from 'fast-json-stable-stringify';

export function stableJsonStringify(value: unknown): string {
  return stableStringify(value);
}

export function stableStringifyWorkflow<T>(value: T): string {
  return stableJsonStringify(value);
}
