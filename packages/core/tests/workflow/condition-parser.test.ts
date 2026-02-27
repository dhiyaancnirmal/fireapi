import { describe, expect, it } from 'vitest';

import { ConditionParser } from '../../src/index.js';

describe('ConditionParser', () => {
  it('parses references and operators', () => {
    const parser = new ConditionParser();
    const result = parser.parse('params.query == "books" && exists extract.results');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.kind).toBe('binary');
    }
  });

  it('rejects invalid syntax', () => {
    const parser = new ConditionParser();
    const result = parser.parse('params.query ==');

    expect(result.ok).toBe(false);
  });
});
