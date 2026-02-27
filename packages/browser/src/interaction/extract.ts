import type { Locator, Page } from 'playwright-core';

import { FireAPIError } from '../errors.js';
import type { Result, TableExtractionResult } from '../types.js';

export async function extractTextFromSelector(
  page: Page,
  selector: string,
): Promise<Result<string | null, FireAPIError>> {
  try {
    const text = await page.locator(selector).first().textContent();
    return { ok: true, data: text };
  } catch (error) {
    return {
      ok: false,
      error: new FireAPIError('Failed to extract text', 'EXTRACT_FAILED', 502, {
        selector,
        cause: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

export async function extractAttributeFromSelector(
  page: Page,
  selector: string,
  attribute: string,
): Promise<Result<string | null, FireAPIError>> {
  try {
    const value = await page.locator(selector).first().getAttribute(attribute);
    return { ok: true, data: value };
  } catch (error) {
    return {
      ok: false,
      error: new FireAPIError('Failed to extract attribute', 'EXTRACT_FAILED', 502, {
        selector,
        attribute,
        cause: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

export async function extractTableFromLocator(
  locator: Locator,
  sampleRows?: number,
): Promise<Result<TableExtractionResult, FireAPIError>> {
  try {
    const result = await locator.evaluate((table, maxRows) => {
      if (!(table instanceof HTMLTableElement)) {
        throw new Error('Target is not a table element');
      }

      const headerCells = table.querySelectorAll('thead th').length
        ? Array.from(table.querySelectorAll('thead th'))
        : Array.from(table.querySelector('tr')?.querySelectorAll('th,td') ?? []);
      const headers = headerCells.map(
        (cell) => cell.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      );

      const rawRows = Array.from(table.querySelectorAll('tbody tr')).length
        ? Array.from(table.querySelectorAll('tbody tr'))
        : Array.from(table.querySelectorAll('tr')).slice(1);
      const limited =
        typeof maxRows === 'number' && maxRows > 0 ? rawRows.slice(0, maxRows) : rawRows;

      const rows = limited.map((row) => {
        const cells = Array.from(row.querySelectorAll('th,td')).map(
          (cell) => cell.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        );
        const width = Math.max(headers.length, cells.length);
        const out: Record<string, string> = {};
        for (let i = 0; i < width; i += 1) {
          const key = headers[i] || `column_${i + 1}`;
          out[key] = cells[i] ?? '';
        }
        return out;
      });

      return {
        headers: headers.length > 0 ? headers : Object.keys(rows[0] ?? {}),
        rows,
        rowCount: rawRows.length,
      };
    }, sampleRows);

    return { ok: true, data: result };
  } catch (error) {
    return {
      ok: false,
      error: new FireAPIError('Failed to extract table', 'EXTRACT_FAILED', 502, {
        cause: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

export async function extractTableFromSelector(
  page: Page,
  selector: string,
  sampleRows?: number,
): Promise<Result<TableExtractionResult, FireAPIError>> {
  const locator = page.locator(selector).first();
  return extractTableFromLocator(locator, sampleRows);
}

export { normalizeText };
