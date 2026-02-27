import { describe, expect, it } from 'vitest';

import { inferSchemaFromSamples, mergeInferredSchemas } from '../../src/index.js';

describe('infer-merge', () => {
  it('infers object optionality across samples', () => {
    const schema = inferSchemaFromSamples([{ a: 'x', b: 1 }, { a: 'y' }]);

    expect(schema.kind).toBe('object');
    if (schema.kind === 'object') {
      expect(schema.requiredKeys).toContain('a');
      expect(schema.requiredKeys).not.toContain('b');
    }
  });

  it('infers table schema from extracted table-like data', () => {
    const schema = inferSchemaFromSamples([
      {
        headers: ['Name', 'Age'],
        rows: [{ Name: 'Alice', Age: '31' }],
        rowCount: 1,
      },
    ]);

    expect(schema.kind).toBe('table');
    if (schema.kind === 'table') {
      expect(schema.headers).toEqual(['Age', 'Name']);
    }
  });

  it('merges compatible schemas deterministically', () => {
    const a = inferSchemaFromSamples([{ status: 'ok' }]);
    const b = inferSchemaFromSamples([{ status: 'failed' }]);

    const merged = mergeInferredSchemas(a, b);
    expect(merged.kind).toBe('object');
    if (merged.kind === 'object') {
      expect(merged.properties.status).toBeDefined();
    }
  });
});
