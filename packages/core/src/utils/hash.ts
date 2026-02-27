import { createHash } from 'node:crypto';

import { stableJsonStringify } from './stable-json.js';

export function hashValue(value: unknown): string {
  return createHash('sha256').update(stableJsonStringify(value)).digest('hex');
}
