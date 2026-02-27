import {
  type BrowserLease,
  ElementInteraction,
  type Result,
  SelectorEngine,
  type SelectorStrategy,
  type TableExtractionResult,
  createBrowserLogger as createBrowserPkgLogger,
} from '@fireapi/browser';
import type { InteractionOptions } from '@fireapi/browser';

import { WorkflowExecutionError } from '../errors.js';
import { type CorePackageLogger, createCoreLogger } from '../logger.js';
import type { BrowserWorkflowRuntimeOptions, WorkflowRuntime } from './types.js';

type PageLike = BrowserLease['page'];

function toError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}

function errorResult(message: string, details?: Record<string, unknown>): Result<never, Error> {
  return {
    ok: false,
    error: new WorkflowExecutionError(message, details),
  };
}

export class BrowserWorkflowRuntime implements WorkflowRuntime {
  private readonly sessionManager: BrowserWorkflowRuntimeOptions['sessionManager'];
  private readonly logger: CorePackageLogger;
  private readonly interaction: ElementInteraction;
  private readonly selectorEngine: SelectorEngine;

  private lease: BrowserLease | null;
  private ownsLease = false;
  private hadError = false;
  private initialized = false;

  constructor(private readonly options: BrowserWorkflowRuntimeOptions) {
    this.logger =
      options.logger ?? createCoreLogger({ base: { module: 'browser-workflow-runtime' } });
    this.interaction =
      options.interaction ??
      new ElementInteraction(
        undefined,
        createBrowserPkgLogger({ base: { module: 'core-runtime-adapter' } }),
      );
    this.selectorEngine = new SelectorEngine(
      createBrowserPkgLogger({ base: { module: 'core-runtime-selector' } }),
    );
    this.sessionManager = options.sessionManager;
    this.lease = options.lease ?? null;
  }

  async init(): Promise<Result<void, Error>> {
    if (this.initialized) {
      return { ok: true, data: undefined };
    }

    if (this.lease) {
      this.initialized = true;
      return { ok: true, data: undefined };
    }

    if (!this.sessionManager) {
      return errorResult('BrowserWorkflowRuntime requires either a lease or a sessionManager', {
        hasLease: false,
        hasSessionManager: false,
      });
    }

    const acquired = await this.sessionManager.acquire();
    if (!acquired.ok) {
      this.hadError = true;
      return { ok: false, error: toError(acquired.error, 'Failed to acquire browser lease') };
    }

    this.lease = acquired.data;
    this.ownsLease = true;
    this.initialized = true;
    return { ok: true, data: undefined };
  }

  async navigate(url: string, options?: { timeoutMs?: number }): Promise<Result<void, Error>> {
    const page = await this.requirePage();
    if (!page.ok) {
      return page;
    }

    try {
      await page.data.goto(url, {
        waitUntil: 'domcontentloaded',
        ...(options?.timeoutMs !== undefined ? { timeout: options.timeoutMs } : {}),
      });
      return { ok: true, data: undefined };
    } catch (error) {
      this.hadError = true;
      return { ok: false, error: toError(error, 'Failed to navigate') };
    }
  }

  async fill(
    selectors: SelectorStrategy[],
    value: string,
    options?: InteractionOptions,
  ): Promise<Result<void, Error>> {
    const page = await this.requirePage();
    if (!page.ok) {
      return page;
    }
    const result = await this.interaction.fill(page.data, selectors, value, options);
    if (!result.ok) {
      this.hadError = true;
    }
    return result;
  }

  async select(
    selectors: SelectorStrategy[],
    value: string,
    options?: InteractionOptions,
  ): Promise<Result<void, Error>> {
    const page = await this.requirePage();
    if (!page.ok) {
      return page;
    }
    const result = await this.interaction.select(page.data, selectors, value, options);
    if (!result.ok) {
      this.hadError = true;
    }
    return result;
  }

  async click(
    selectors: SelectorStrategy[],
    options?: InteractionOptions,
  ): Promise<Result<void, Error>> {
    const page = await this.requirePage();
    if (!page.ok) {
      return page;
    }
    const result = await this.interaction.click(page.data, selectors, options);
    if (!result.ok) {
      this.hadError = true;
    }
    return result;
  }

  async waitFor(
    selectors: SelectorStrategy[],
    options?: InteractionOptions,
  ): Promise<Result<void, Error>> {
    const page = await this.requirePage();
    if (!page.ok) {
      return page;
    }
    const result = await this.interaction.waitFor(page.data, selectors, options);
    if (!result.ok) {
      this.hadError = true;
    }
    return result;
  }

  async waitForNetworkIdle(timeoutMs = 10000): Promise<Result<void, Error>> {
    const page = await this.requirePage();
    if (!page.ok) {
      return page;
    }
    try {
      await page.data.waitForLoadState('networkidle', { timeout: timeoutMs });
      return { ok: true, data: undefined };
    } catch (error) {
      this.hadError = true;
      return { ok: false, error: toError(error, 'Failed waiting for network idle') };
    }
  }

  async extractText(selectors: SelectorStrategy[]): Promise<Result<string | null, Error>> {
    const page = await this.requirePage();
    if (!page.ok) {
      return page;
    }
    const result = await this.interaction.extractText(page.data, selectors);
    if (!result.ok) {
      this.hadError = true;
    }
    return result;
  }

  async extractAttribute(
    selectors: SelectorStrategy[],
    attribute: string,
  ): Promise<Result<string | null, Error>> {
    const page = await this.requirePage();
    if (!page.ok) {
      return page;
    }
    const result = await this.interaction.extractAttribute(page.data, selectors, attribute);
    if (!result.ok) {
      this.hadError = true;
    }
    return result;
  }

  async extractTable(
    selectors: SelectorStrategy[],
    options?: { sampleRows?: number },
  ): Promise<Result<TableExtractionResult, Error>> {
    const page = await this.requirePage();
    if (!page.ok) {
      return page;
    }
    const result = await this.interaction.extractTable(page.data, selectors, options);
    if (!result.ok) {
      this.hadError = true;
    }
    return result;
  }

  async extractList(
    selectors: SelectorStrategy[],
    options: { itemSelector: string; mode: 'text' | 'attribute'; attributeName?: string },
  ): Promise<Result<string[], Error>> {
    const page = await this.requirePage();
    if (!page.ok) {
      return page;
    }

    if (options.mode === 'attribute' && !options.attributeName) {
      return errorResult('attributeName is required when extractList mode=attribute');
    }

    try {
      let containerSelector: string | null = null;
      if (selectors.length > 0) {
        const resolved = await this.selectorEngine.resolveFirst(page.data, selectors);
        if (!resolved.ok) {
          this.hadError = true;
          return resolved;
        }
        containerSelector = resolved.data.value;
      }

      const locator = containerSelector
        ? page.data.locator(containerSelector).first().locator(options.itemSelector)
        : page.data.locator(options.itemSelector);

      const values = await locator.evaluateAll(
        (nodes: Element[], args: { mode: 'text' | 'attribute'; attributeName?: string }) =>
          nodes.map((node: Element) => {
            if (args.mode === 'attribute') {
              return node.getAttribute(args.attributeName ?? '') ?? '';
            }
            return node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
          }),
        options,
      );

      return { ok: true, data: values };
    } catch (error) {
      this.hadError = true;
      return { ok: false, error: toError(error, 'Failed to extract list') };
    }
  }

  async close(): Promise<void> {
    if (!this.lease) {
      return;
    }
    if (this.ownsLease && this.sessionManager) {
      try {
        await this.sessionManager.release(this.lease, this.hadError ? 'error' : 'ok');
      } catch (error) {
        this.logger.warn?.(
          { err: error instanceof Error ? error.message : String(error) },
          'Failed to release browser lease',
        );
      }
    }
    this.lease = null;
    this.ownsLease = false;
    this.initialized = false;
  }

  private async requirePage(): Promise<Result<PageLike, Error>> {
    if (!this.initialized) {
      const initialized = await this.init();
      if (!initialized.ok) {
        return initialized;
      }
    }

    if (!this.lease) {
      this.hadError = true;
      return errorResult('BrowserWorkflowRuntime has no active lease');
    }

    return { ok: true, data: this.lease.page };
  }
}
