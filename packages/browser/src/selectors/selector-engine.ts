import type { Page } from 'playwright-core';

import { SelectorError } from '../errors.js';
import { createBrowserLogger } from '../logger.js';
import type {
  BrowserPackageLogger,
  Result,
  SelectorGenerateInput,
  SelectorStrategy,
} from '../types.js';
import { buildSelectorCandidates } from './selector-builders.js';
import { sortSelectorStrategies } from './selector-ranking.js';

export class SelectorEngine {
  private readonly logger: BrowserPackageLogger;

  constructor(logger?: BrowserPackageLogger) {
    this.logger = logger ?? createBrowserLogger({ base: { module: 'selector-engine' } });
  }

  generateCandidates(input: SelectorGenerateInput): SelectorStrategy[] {
    return buildSelectorCandidates(input);
  }

  async resolveFirst(
    page: Page,
    selectors: SelectorStrategy[],
  ): Promise<Result<SelectorStrategy, SelectorError>> {
    const sorted = sortSelectorStrategies(selectors);
    const tried: string[] = [];

    for (const selector of sorted) {
      tried.push(selector.value);
      try {
        const locator = page.locator(selector.value);
        const count = await locator.count();
        if (count > 0) {
          this.logger.debug?.({ selector: selector.value, count }, 'Resolved selector');
          return { ok: true, data: selector };
        }
      } catch (error) {
        this.logger.debug?.({ err: error, selector: selector.value }, 'Selector candidate failed');
      }
    }

    return {
      ok: false,
      error: new SelectorError('All selector strategies failed', tried),
    };
  }
}
