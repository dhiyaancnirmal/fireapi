import { describe, expect, it } from 'vitest';

import { ConditionEvaluator } from '../../src/index.js';

describe('ConditionEvaluator', () => {
  it('evaluates reference and contains operations', () => {
    const evaluator = new ConditionEvaluator();
    const result = evaluator.evaluate('params.query contains "book" && extract.rowsCount > 1', {
      params: { query: 'books' },
      extract: { rowsCount: 2 },
      steps: {},
      loop: { iteration: 0, stackDepth: 0 },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe(true);
    }
  });

  it('returns false for unmet condition', () => {
    const evaluator = new ConditionEvaluator();
    const result = evaluator.evaluate('params.query == "cars"', {
      params: { query: 'books' },
      extract: {},
      steps: {},
      loop: { iteration: 0, stackDepth: 0 },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe(false);
    }
  });
});
