import type { Page } from 'playwright-core';

import type { RawDomSnapshot } from '../types.js';

export async function captureDomSnapshot(page: Page): Promise<RawDomSnapshot> {
  return page.evaluate(() => {
    type SelectOption = { label: string; value: string };
    type RawElement = {
      tagName: string;
      inputType: string | null;
      name: string | null;
      id: string | null;
      className: string | null;
      label: string | null;
      placeholder: string | null;
      ariaLabel: string | null;
      required: boolean;
      formId: string | null;
      formName: string | null;
      textContent: string | null;
      options?: SelectOption[];
      attributes: Record<string, string>;
      domPath: number[];
    };

    type RawTable = {
      id: string | null;
      className: string | null;
      headers: string[];
      rows: string[][];
      rowCount: number;
      domPath: number[];
    };

    type RawForm = {
      id: string | null;
      name: string | null;
      action: string | null;
      method: string | null;
      domPath: number[];
    };

    type RawPaginationControl = {
      kindHint: 'next' | 'prev' | 'number' | 'load_more' | 'unknown';
      label: string;
      pageNumber?: number;
      tagName: string;
      id: string | null;
      className: string | null;
      ariaLabel: string | null;
      domPath: number[];
      attributes: Record<string, string>;
    };

    const normalizeText = (value: string | null | undefined): string | null => {
      const trimmed = value?.replace(/\s+/g, ' ').trim();
      return trimmed ? trimmed : null;
    };

    const escapeCssAttributeValue = (value: string): string => value.replace(/["\\]/g, '\\$&');

    const getDomPath = (element: Element): number[] => {
      const path: number[] = [];
      let current: Element | null = element;
      while (current && current !== document.documentElement) {
        const parentElement: Element | null = current.parentElement;
        if (!parentElement) {
          break;
        }
        const siblings = Array.from(parentElement.children);
        const index = siblings.indexOf(current);
        path.unshift(index >= 0 ? index : 0);
        current = parentElement;
      }
      return path;
    };

    const extractAttributes = (element: Element): Record<string, string> => {
      const attributeNames = ['id', 'name', 'type', 'placeholder', 'aria-label', 'class', 'role'];
      const attributes: Record<string, string> = {};
      for (const name of attributeNames) {
        const value = element.getAttribute(name);
        if (value) {
          attributes[name] = value;
        }
      }
      return attributes;
    };

    const findLabelText = (element: Element): string | null => {
      const htmlElement = element as HTMLElement;
      if ('labels' in htmlElement) {
        const labels = (htmlElement as HTMLInputElement).labels;
        if (labels && labels.length > 0) {
          return normalizeText(labels[0]?.textContent ?? null);
        }
      }

      const id = element.getAttribute('id');
      if (id) {
        const explicit = document.querySelector(`label[for=\"${escapeCssAttributeValue(id)}\"]`);
        if (explicit) {
          return normalizeText(explicit.textContent);
        }
      }

      const wrapped = element.closest('label');
      return normalizeText(wrapped?.textContent ?? null);
    };

    const interactiveSelectors = ['input', 'select', 'textarea', 'button'];
    const interactiveElements = Array.from(
      document.querySelectorAll(interactiveSelectors.join(',')),
    );
    const elements: RawElement[] = interactiveElements
      .filter((node) => {
        if (!(node instanceof HTMLElement)) {
          return false;
        }
        const tag = node.tagName.toLowerCase();
        if (tag === 'input') {
          const type = (node.getAttribute('type') ?? 'text').toLowerCase();
          return type !== 'hidden';
        }
        return true;
      })
      .map((node) => {
        const tagName = node.tagName.toLowerCase();
        const inputType =
          tagName === 'input' ? (node.getAttribute('type') ?? 'text').toLowerCase() : null;
        const form = node.closest('form');
        const selectOptions =
          node instanceof HTMLSelectElement
            ? Array.from(node.options).map((option) => ({
                label: normalizeText(option.textContent) ?? option.value,
                value: option.value,
              }))
            : undefined;

        const base = {
          tagName,
          inputType,
          name: node.getAttribute('name'),
          id: node.getAttribute('id'),
          className: node.getAttribute('class'),
          label: findLabelText(node),
          placeholder: node.getAttribute('placeholder'),
          ariaLabel: node.getAttribute('aria-label'),
          required: node.hasAttribute('required'),
          formId: form?.getAttribute('id') ?? null,
          formName: form?.getAttribute('name') ?? null,
          textContent: normalizeText(node.textContent),
          attributes: extractAttributes(node),
          domPath: getDomPath(node),
        };

        return selectOptions ? { ...base, options: selectOptions } : base;
      });

    const tables: RawTable[] = Array.from(document.querySelectorAll('table')).map((table) => {
      const ths = Array.from(table.querySelectorAll('thead th'));
      const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
      const fallbackRows =
        bodyRows.length > 0 ? bodyRows : Array.from(table.querySelectorAll('tr')).slice(1);
      const allRows = Array.from(table.querySelectorAll('tr'));
      const firstRow = allRows[0] ?? null;
      const headerCells =
        ths.length > 0 ? ths : firstRow ? Array.from(firstRow.querySelectorAll('th,td')) : [];
      const headers = headerCells.map((cell) => normalizeText(cell.textContent) ?? '');
      const rows = fallbackRows
        .slice(0, 20)
        .map((row) =>
          Array.from(row.querySelectorAll('td,th')).map(
            (cell) => normalizeText(cell.textContent) ?? '',
          ),
        );

      return {
        id: table.getAttribute('id'),
        className: table.getAttribute('class'),
        headers,
        rows,
        rowCount: fallbackRows.length,
        domPath: getDomPath(table),
      } satisfies RawTable;
    });

    const forms: RawForm[] = Array.from(document.querySelectorAll('form')).map((form) => ({
      id: form.getAttribute('id'),
      name: form.getAttribute('name'),
      action: form.getAttribute('action'),
      method: (form.getAttribute('method') ?? 'get').toLowerCase(),
      domPath: getDomPath(form),
    }));

    const paginationControls: RawPaginationControl[] = [];
    for (const node of Array.from(document.querySelectorAll('a, button'))) {
      const label =
        normalizeText(node.textContent) ?? normalizeText(node.getAttribute('aria-label')) ?? '';
      if (!label) {
        continue;
      }
      const lower = label.toLowerCase();
      let kindHint: RawPaginationControl['kindHint'] = 'unknown';
      let pageNumber: number | undefined;
      if (/^\d+$/.test(label)) {
        kindHint = 'number';
        pageNumber = Number.parseInt(label, 10);
      } else if (/\bnext\b|›|»/.test(lower)) {
        kindHint = 'next';
      } else if (/\bprev\b|\bprevious\b|‹|«/.test(lower)) {
        kindHint = 'prev';
      } else if (/load\s*more|show\s*more|more\s*results/.test(lower)) {
        kindHint = 'load_more';
      }

      if (kindHint === 'unknown') {
        continue;
      }

      const attributes = extractAttributes(node);
      const base = {
        kindHint,
        label,
        tagName: node.tagName.toLowerCase(),
        id: node.getAttribute('id'),
        className: node.getAttribute('class'),
        ariaLabel: node.getAttribute('aria-label'),
        domPath: getDomPath(node),
        attributes,
      };

      paginationControls.push(typeof pageNumber === 'number' ? { ...base, pageNumber } : base);
    }

    return {
      url: window.location.href,
      timestamp: new Date().toISOString(),
      elements,
      tables,
      forms,
      paginationControls,
    } satisfies RawDomSnapshot;
  });
}
