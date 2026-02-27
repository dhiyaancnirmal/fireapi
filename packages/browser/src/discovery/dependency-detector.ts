import type { Page } from 'playwright-core';

import { createBrowserLogger } from '../logger.js';
import { SelectorEngine } from '../selectors/selector-engine.js';
import type { BrowserPackageLogger, DiscoveredElement, FormDependency } from '../types.js';

export interface DependencyDetectorOptions {
  maxPairs?: number;
  maxSourceOptions?: number;
  settleMs?: number;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
}

async function getSelectOptionValues(page: Page, selector: string): Promise<string[]> {
  const locator = page.locator(selector).first();
  return locator.evaluate((node) => {
    if (!(node instanceof HTMLSelectElement)) {
      return [];
    }
    return Array.from(node.options).map((option) => option.value);
  });
}

async function getSelectCurrentValue(page: Page, selector: string): Promise<string | null> {
  const locator = page.locator(selector).first();
  try {
    return await locator.inputValue();
  } catch {
    return null;
  }
}

export class DependencyDetector {
  private readonly selectorEngine: SelectorEngine;
  private readonly logger: BrowserPackageLogger;

  constructor(deps?: { selectorEngine?: SelectorEngine; logger?: BrowserPackageLogger }) {
    this.selectorEngine = deps?.selectorEngine ?? new SelectorEngine(deps?.logger);
    this.logger = deps?.logger ?? createBrowserLogger({ base: { module: 'dependency-detector' } });
  }

  async detectCascadingSelects(
    page: Page,
    elements: DiscoveredElement[],
    options: DependencyDetectorOptions = {},
  ): Promise<FormDependency[]> {
    const selects = elements.filter(
      (element) => element.type === 'select' && (element.options?.length ?? 0) > 0,
    );
    const maxPairs = options.maxPairs ?? 20;
    const maxSourceOptions = options.maxSourceOptions ?? 5;
    const settleMs = options.settleMs ?? 150;
    const dependencies: FormDependency[] = [];

    let pairsChecked = 0;
    for (const source of selects) {
      for (const target of selects) {
        if (source.id === target.id) {
          continue;
        }
        if (source.formId !== target.formId) {
          continue;
        }
        if (pairsChecked >= maxPairs) {
          return dependencies;
        }
        pairsChecked += 1;

        const sourceResolved = await this.selectorEngine.resolveFirst(page, source.selectors);
        const targetResolved = await this.selectorEngine.resolveFirst(page, target.selectors);
        if (!sourceResolved.ok || !targetResolved.ok) {
          continue;
        }

        const sourceSelector = sourceResolved.data.value;
        const targetSelector = targetResolved.data.value;
        const baselineOptions = await getSelectOptionValues(page, targetSelector);
        const originalSourceValue = await getSelectCurrentValue(page, sourceSelector);

        const observedValues: Record<string, string[]> = {};
        const sourceOptions = source.options?.slice(0, maxSourceOptions) ?? [];
        for (const option of sourceOptions) {
          try {
            await page.locator(sourceSelector).first().selectOption(option.value);
            if (settleMs > 0) {
              await page.waitForTimeout(settleMs);
            }
            const targetOptions = await getSelectOptionValues(page, targetSelector);
            if (!arraysEqual(baselineOptions, targetOptions)) {
              observedValues[option.value] = targetOptions;
            }
          } catch (error) {
            this.logger.debug?.(
              { err: error, source: source.id, target: target.id },
              'Dependency probe failed',
            );
          }
        }

        if (originalSourceValue !== null) {
          try {
            await page.locator(sourceSelector).first().selectOption(originalSourceValue);
          } catch {
            // best effort reset only
          }
        }

        if (Object.keys(observedValues).length > 0) {
          dependencies.push({
            sourceElement: source.id,
            targetElement: target.id,
            type: 'cascading_options',
            observedValues,
          });
        }
      }
    }

    return dependencies;
  }
}
