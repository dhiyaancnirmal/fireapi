import { describe, expect, it } from 'vitest';

import { ZodBuilder } from '../../src/index.js';
import type { InferredSchema } from '../../src/schema/types.js';

describe('ZodBuilder', () => {
  it('builds zod schemas and json schema', () => {
    const builder = new ZodBuilder();
    const input: InferredSchema = {
      kind: 'object',
      properties: {
        query: { kind: 'primitive', type: 'string' },
      },
      requiredKeys: ['query'],
    };
    const output: InferredSchema = {
      kind: 'table',
      headers: ['Name'],
      rowSchema: {
        kind: 'object',
        properties: {
          Name: { kind: 'primitive', type: 'string' },
        },
        requiredKeys: ['Name'],
      },
      rowCount: { min: 0, max: 10 },
    };

    const generated = builder.buildGenerated(input, output);
    expect(generated.input.safeParse({ query: 'books' }).success).toBe(true);
    expect(generated.outputJsonSchema).toEqual(expect.objectContaining({ type: 'object' }));
  });
});
