import type { Page } from 'playwright-core';

import { FireAPIError } from '../errors.js';
import { createBrowserLogger } from '../logger.js';
import { SelectorEngine } from '../selectors/selector-engine.js';
import type {
  BrowserPackageLogger,
  InteractionOptions,
  Result,
  SelectorStrategy,
  TableExtractionResult,
} from '../types.js';
import { extractTableFromSelector } from './extract.js';
import { waitForSelectorVisible, waitForTimeoutMs } from './wait.js';

function toActionError(
  message: string,
  code: string,
  details: Record<string, unknown>,
  cause: unknown,
): FireAPIError {
  return new FireAPIError(message, code, 502, {
    ...details,
    cause: cause instanceof Error ? cause.message : String(cause),
  });
}

function timeoutOption(timeoutMs: number | undefined): { timeout: number } | undefined {
  return typeof timeoutMs === 'number' ? { timeout: timeoutMs } : undefined;
}

export class ElementInteraction {
  private readonly selectorEngine: SelectorEngine;
  private readonly logger: BrowserPackageLogger;

  constructor(selectorEngine?: SelectorEngine, logger?: BrowserPackageLogger) {
    this.selectorEngine = selectorEngine ?? new SelectorEngine(logger);
    this.logger = logger ?? createBrowserLogger({ base: { module: 'element-interaction' } });
  }

  async fill(
    page: Page,
    selectors: SelectorStrategy[],
    value: string,
    options: InteractionOptions = {},
  ): Promise<Result<void, FireAPIError>> {
    const resolved = await this.selectorEngine.resolveFirst(page, selectors);
    if (!resolved.ok) {
      return resolved;
    }

    const selector = resolved.data.value;
    try {
      if (options.waitForVisible) {
        const waited = await waitForSelectorVisible(page, selector, options.timeoutMs ?? 5000);
        if (!waited.ok) {
          return waited;
        }
      }
      await page.locator(selector).first().fill(value, timeoutOption(options.timeoutMs));
      this.logger.debug?.({ selector, valueLength: value.length }, 'Filled element');
      return { ok: true, data: undefined };
    } catch (error) {
      return {
        ok: false,
        error: toActionError('Failed to fill element', 'INTERACTION_FAILED', { selector }, error),
      };
    }
  }

  async select(
    page: Page,
    selectors: SelectorStrategy[],
    value: string,
    options: InteractionOptions = {},
  ): Promise<Result<void, FireAPIError>> {
    const resolved = await this.selectorEngine.resolveFirst(page, selectors);
    if (!resolved.ok) {
      return resolved;
    }
    const selector = resolved.data.value;

    try {
      await page.locator(selector).first().selectOption(value, timeoutOption(options.timeoutMs));
      return { ok: true, data: undefined };
    } catch (error) {
      return {
        ok: false,
        error: toActionError(
          'Failed to select option',
          'INTERACTION_FAILED',
          { selector, value },
          error,
        ),
      };
    }
  }

  async click(
    page: Page,
    selectors: SelectorStrategy[],
    options: InteractionOptions = {},
  ): Promise<Result<void, FireAPIError>> {
    const resolved = await this.selectorEngine.resolveFirst(page, selectors);
    if (!resolved.ok) {
      return resolved;
    }
    const selector = resolved.data.value;

    try {
      await page.locator(selector).first().click(timeoutOption(options.timeoutMs));
      return { ok: true, data: undefined };
    } catch (error) {
      return {
        ok: false,
        error: toActionError('Failed to click element', 'INTERACTION_FAILED', { selector }, error),
      };
    }
  }

  async waitFor(
    page: Page,
    selectors: SelectorStrategy[],
    options: InteractionOptions = {},
  ): Promise<Result<void, FireAPIError>> {
    if (selectors.length === 0) {
      return waitForTimeoutMs(page, options.timeoutMs ?? 100);
    }

    const resolved = await this.selectorEngine.resolveFirst(page, selectors);
    if (!resolved.ok) {
      return resolved;
    }

    return waitForSelectorVisible(page, resolved.data.value, options.timeoutMs ?? 5000);
  }

  async extractTable(
    page: Page,
    selectors: SelectorStrategy[],
    options: { sampleRows?: number } = {},
  ): Promise<Result<TableExtractionResult, FireAPIError>> {
    const resolved = await this.selectorEngine.resolveFirst(page, selectors);
    if (!resolved.ok) {
      return resolved;
    }

    return extractTableFromSelector(page, resolved.data.value, options.sampleRows);
  }

  async extractText(
    page: Page,
    selectors: SelectorStrategy[],
  ): Promise<Result<string | null, FireAPIError>> {
    const resolved = await this.selectorEngine.resolveFirst(page, selectors);
    if (!resolved.ok) {
      return resolved;
    }

    try {
      const value = await page.locator(resolved.data.value).first().textContent();
      return { ok: true, data: value };
    } catch (error) {
      return {
        ok: false,
        error: toActionError(
          'Failed to extract text',
          'EXTRACT_FAILED',
          { selector: resolved.data.value },
          error,
        ),
      };
    }
  }

  async extractAttribute(
    page: Page,
    selectors: SelectorStrategy[],
    attribute: string,
  ): Promise<Result<string | null, FireAPIError>> {
    const resolved = await this.selectorEngine.resolveFirst(page, selectors);
    if (!resolved.ok) {
      return resolved;
    }

    try {
      const value = await page.locator(resolved.data.value).first().getAttribute(attribute);
      return { ok: true, data: value };
    } catch (error) {
      return {
        ok: false,
        error: toActionError(
          'Failed to extract attribute',
          'EXTRACT_FAILED',
          { selector: resolved.data.value, attribute },
          error,
        ),
      };
    }
  }
}
