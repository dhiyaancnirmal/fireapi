import { JSDOM } from 'jsdom';
import type { Page } from 'playwright-core';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function withDomGlobals<T>(dom: JSDOM, fn: () => T): T {
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    CSS: globalThis.CSS,
    HTMLElement: globalThis.HTMLElement,
    Element: globalThis.Element,
    Node: globalThis.Node,
    HTMLSelectElement: globalThis.HTMLSelectElement,
    HTMLInputElement: globalThis.HTMLInputElement,
    HTMLTextAreaElement: globalThis.HTMLTextAreaElement,
    HTMLTableElement: globalThis.HTMLTableElement,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent,
  };

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    CSS: dom.window.CSS,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    HTMLSelectElement: dom.window.HTMLSelectElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
    HTMLTableElement: dom.window.HTMLTableElement,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
  });

  try {
    return fn();
  } finally {
    Object.assign(globalThis, previous);
  }
}

function parseSimpleXPath(document: Document, selector: string): Element[] {
  const idMatch = selector.match(/^xpath=\/\/\*\[@id=(?:'|")(.+?)(?:'|")\]$/);
  if (idMatch) {
    const el = document.getElementById(idMatch[1]);
    return el ? [el] : [];
  }

  const tagNameMatch = selector.match(/^xpath=\/\/(\w+)\[@name=(?:'|")(.+?)(?:'|")\]$/);
  if (tagNameMatch) {
    const [, tagName, name] = tagNameMatch;
    const escapedName = name.replaceAll('"', '\\"');
    return Array.from(document.querySelectorAll(`${tagName}[name=\"${escapedName}\"]`));
  }

  return [];
}

function findByText(document: Document, needle: string): Element[] {
  const normalizedNeedle = normalizeText(needle);
  if (!normalizedNeedle) {
    return [];
  }
  return Array.from(document.querySelectorAll('*')).filter((el) => {
    const text = normalizeText(el.textContent);
    return text.includes(normalizedNeedle);
  });
}

function findByAria(document: Document, label: string): Element[] {
  const exact = normalizeText(label);
  const matches = new Set<Element>();

  for (const el of Array.from(document.querySelectorAll('[aria-label]'))) {
    if (normalizeText(el.getAttribute('aria-label')) === exact) {
      matches.add(el);
    }
  }

  for (const labelEl of Array.from(document.querySelectorAll('label'))) {
    if (normalizeText(labelEl.textContent) !== exact) {
      continue;
    }
    const forAttr = labelEl.getAttribute('for');
    if (forAttr) {
      const control = document.getElementById(forAttr);
      if (control) {
        matches.add(control);
      }
    }
    const nested = labelEl.querySelector('input, select, textarea, button');
    if (nested) {
      matches.add(nested);
    }
  }

  return Array.from(matches);
}

class MockLocator {
  private readonly page: MockPage;
  private readonly selector: string;
  private readonly single: boolean;

  constructor(page: MockPage, selector: string, single = false) {
    this.page = page;
    this.selector = selector;
    this.single = single;
  }

  first(): MockLocator {
    return new MockLocator(this.page, this.selector, true);
  }

  async count(): Promise<number> {
    return this.resolveElements().length;
  }

  async fill(value: string): Promise<void> {
    const element = this.requireElement();
    if (
      !(element instanceof this.page.window.HTMLInputElement) &&
      !(element instanceof this.page.window.HTMLTextAreaElement)
    ) {
      throw new Error('Element is not fillable');
    }
    element.value = value;
    element.dispatchEvent(new this.page.window.Event('input', { bubbles: true }));
    element.dispatchEvent(new this.page.window.Event('change', { bubbles: true }));
  }

  async click(): Promise<void> {
    const element = this.requireElement();
    element.dispatchEvent(new this.page.window.MouseEvent('click', { bubbles: true }));
  }

  async selectOption(value: string): Promise<void> {
    const element = this.requireElement();
    if (!(element instanceof this.page.window.HTMLSelectElement)) {
      throw new Error('Element is not a select');
    }
    element.value = value;
    element.dispatchEvent(new this.page.window.Event('change', { bubbles: true }));
  }

  async waitFor(options?: { state?: 'visible' | 'attached'; timeout?: number }): Promise<void> {
    const timeout = options?.timeout ?? 1000;
    const end = Date.now() + timeout;

    while (Date.now() < end) {
      const element = this.resolveElements()[0] ?? null;
      if (element) {
        if (options?.state === 'visible') {
          const htmlEl = element as HTMLElement;
          if (
            !htmlEl.hidden &&
            htmlEl.style.display !== 'none' &&
            htmlEl.style.visibility !== 'hidden'
          ) {
            return;
          }
        } else {
          return;
        }
      }
      await sleep(10);
    }

    throw new Error(`Timeout waiting for selector ${this.selector}`);
  }

  async textContent(): Promise<string | null> {
    return this.requireElement().textContent;
  }

  async getAttribute(name: string): Promise<string | null> {
    return this.requireElement().getAttribute(name);
  }

  async inputValue(): Promise<string> {
    const element = this.requireElement();
    if (
      element instanceof this.page.window.HTMLInputElement ||
      element instanceof this.page.window.HTMLSelectElement ||
      element instanceof this.page.window.HTMLTextAreaElement
    ) {
      return element.value;
    }
    throw new Error('Element has no input value');
  }

  async evaluate<TArg, TResult>(
    fn: (node: Element, arg: TArg) => TResult,
    arg: TArg,
  ): Promise<TResult> {
    const element = this.requireElement();
    return withDomGlobals(this.page.dom, () => fn(element, arg));
  }

  async evaluateAll<TArg, TResult>(
    fn: (nodes: Element[], arg: TArg) => TResult,
    arg: TArg,
  ): Promise<TResult> {
    const elements = this.resolveElements();
    return withDomGlobals(this.page.dom, () => fn(elements, arg));
  }

  private resolveElements(): Element[] {
    const elements = this.page.querySelectorAll(this.selector);
    return this.single ? (elements[0] ? [elements[0]] : []) : elements;
  }

  private requireElement(): Element {
    const element = this.resolveElements()[0];
    if (!element) {
      throw new Error(`No element matched selector: ${this.selector}`);
    }
    return element;
  }
}

export class MockPage {
  dom: JSDOM;
  currentUrl: string;

  constructor(html?: string, url = 'http://localhost/mock') {
    this.currentUrl = url;
    this.dom = new JSDOM(html ?? '<!doctype html><html><body></body></html>', {
      url,
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
    });
  }

  get window(): Window & typeof globalThis {
    return this.dom.window as unknown as Window & typeof globalThis;
  }

  async setContent(html: string, url = this.currentUrl): Promise<void> {
    this.currentUrl = url;
    this.dom = new JSDOM(html, {
      url,
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
    });
    await sleep(5);
  }

  async goto(url: string): Promise<void> {
    const response = await fetch(url);
    const html = await response.text();
    await this.setContent(html, url);
    await sleep(25);
  }

  locator(selector: string): MockLocator {
    return new MockLocator(this, selector);
  }

  async evaluate<TResult>(fn: () => TResult): Promise<TResult>;
  async evaluate<TArg, TResult>(fn: (arg: TArg) => TResult, arg: TArg): Promise<TResult>;
  async evaluate<TArg, TResult>(
    fn: ((arg?: TArg) => TResult) | (() => TResult),
    arg?: TArg,
  ): Promise<TResult> {
    return withDomGlobals(this.dom, () => {
      if (typeof arg === 'undefined') {
        return (fn as () => TResult)();
      }
      return (fn as (arg: TArg) => TResult)(arg);
    });
  }

  async waitForTimeout(ms: number): Promise<void> {
    await sleep(ms);
  }

  async waitForLoadState(): Promise<void> {
    await sleep(0);
  }

  querySelectorAll(selector: string): Element[] {
    const document = this.dom.window.document;
    if (selector.startsWith('css=')) {
      return Array.from(document.querySelectorAll(selector.slice(4)));
    }
    if (selector.startsWith('xpath=')) {
      return parseSimpleXPath(document, selector);
    }
    if (selector.startsWith('text=')) {
      return findByText(document, selector.slice(5));
    }
    if (selector.startsWith('aria=')) {
      return findByAria(document, selector.slice(5));
    }
    return Array.from(document.querySelectorAll(selector));
  }
}

export function asPlaywrightPage(mock: MockPage): Page {
  return mock as unknown as Page;
}
