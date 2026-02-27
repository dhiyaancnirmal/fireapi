import type { Page } from 'playwright-core';

import { FireAPIError } from '../errors.js';
import type { Result } from '../types.js';

export async function waitForSelectorVisible(
  page: Page,
  selector: string,
  timeoutMs: number,
): Promise<Result<void, FireAPIError>> {
  try {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: timeoutMs });
    return { ok: true, data: undefined };
  } catch (error) {
    return {
      ok: false,
      error: new FireAPIError('Timed out waiting for selector', 'WAIT_FAILED', 502, {
        selector,
        timeoutMs,
        cause: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

export async function waitForTimeoutMs(
  page: Page,
  timeoutMs: number,
): Promise<Result<void, FireAPIError>> {
  try {
    await page.waitForTimeout(timeoutMs);
    return { ok: true, data: undefined };
  } catch (error) {
    return {
      ok: false,
      error: new FireAPIError('Failed while waiting', 'WAIT_FAILED', 502, {
        timeoutMs,
        cause: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}
