import { sortSelectorStrategies } from '../../src/selectors/selector-ranking.js';
import type { SelectorStrategy } from '../../src/types.js';

describe('sortSelectorStrategies', () => {
  it('sorts by confidence then type priority deterministically', () => {
    const input: SelectorStrategy[] = [
      { type: 'position', value: 'css=html > body > *:nth-child(1)', confidence: 0.2 },
      { type: 'xpath', value: "xpath=//*[@id='x']", confidence: 0.9 },
      { type: 'css', value: 'css=#x', confidence: 0.9 },
      { type: 'aria', value: 'aria=X', confidence: 0.9 },
      { type: 'text', value: 'text=X', confidence: 0.6 },
    ];

    const sorted = sortSelectorStrategies(input);
    expect(sorted.map((selector) => selector.type)).toEqual([
      'css',
      'xpath',
      'aria',
      'text',
      'position',
    ]);
    expect(sortSelectorStrategies(input)).toEqual(sorted);
  });
});
