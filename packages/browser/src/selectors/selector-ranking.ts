import type { SelectorStrategy, SelectorStrategyType } from '../types.js';

const TYPE_PRIORITY: Record<SelectorStrategyType, number> = {
  css: 0,
  xpath: 1,
  aria: 2,
  text: 3,
  position: 4,
};

export function sortSelectorStrategies(strategies: SelectorStrategy[]): SelectorStrategy[] {
  return [...strategies].sort((a, b) => {
    if (a.confidence !== b.confidence) {
      return b.confidence - a.confidence;
    }
    const typeDiff = TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type];
    if (typeDiff !== 0) {
      return typeDiff;
    }
    return a.value.localeCompare(b.value);
  });
}

export function selectorTypePriority(type: SelectorStrategyType): number {
  return TYPE_PRIORITY[type];
}
