import type {
  InteractionOptions,
  Result,
  SelectorStrategy,
  TableExtractionResult,
} from '@fireapi/browser';

import type { WorkflowRuntime } from '../../src/workflow/types.js';

interface FakeRuntimeOverrides {
  shouldFail?: Partial<Record<keyof WorkflowRuntime, string>>;
}

export class FakeRuntime implements WorkflowRuntime {
  public readonly calls: Array<{ method: string; args: unknown[] }> = [];
  public extracted: Record<string, unknown> = {};
  public closed = 0;

  constructor(private readonly overrides: FakeRuntimeOverrides = {}) {}

  async navigate(url: string): Promise<Result<void, Error>> {
    this.calls.push({ method: 'navigate', args: [url] });
    return this.okVoidOrFail('navigate');
  }

  async fill(
    selectors: SelectorStrategy[],
    value: string,
    _options?: InteractionOptions,
  ): Promise<Result<void, Error>> {
    this.calls.push({ method: 'fill', args: [selectors, value] });
    return this.okVoidOrFail('fill');
  }

  async select(
    selectors: SelectorStrategy[],
    value: string,
    _options?: InteractionOptions,
  ): Promise<Result<void, Error>> {
    this.calls.push({ method: 'select', args: [selectors, value] });
    return this.okVoidOrFail('select');
  }

  async click(
    selectors: SelectorStrategy[],
    _options?: InteractionOptions,
  ): Promise<Result<void, Error>> {
    this.calls.push({ method: 'click', args: [selectors] });
    return this.okVoidOrFail('click');
  }

  async waitFor(
    selectors: SelectorStrategy[],
    options?: InteractionOptions,
  ): Promise<Result<void, Error>> {
    this.calls.push({ method: 'waitFor', args: [selectors, options] });
    return this.okVoidOrFail('waitFor');
  }

  async extractText(selectors: SelectorStrategy[]): Promise<Result<string | null, Error>> {
    this.calls.push({ method: 'extractText', args: [selectors] });
    const failed = this.fail('extractText');
    if (failed) return failed;
    return { ok: true, data: 'hello' };
  }

  async extractAttribute(
    selectors: SelectorStrategy[],
    attribute: string,
  ): Promise<Result<string | null, Error>> {
    this.calls.push({ method: 'extractAttribute', args: [selectors, attribute] });
    const failed = this.fail('extractAttribute');
    if (failed) return failed;
    return { ok: true, data: 'value' };
  }

  async extractTable(
    selectors: SelectorStrategy[],
    _options?: { sampleRows?: number },
  ): Promise<Result<TableExtractionResult, Error>> {
    this.calls.push({ method: 'extractTable', args: [selectors] });
    const failed = this.fail('extractTable');
    if (failed) return failed;
    return {
      ok: true,
      data: {
        headers: ['Name'],
        rows: [{ Name: 'Alice' }],
        rowCount: 1,
      },
    };
  }

  async extractList(
    selectors: SelectorStrategy[],
    options: { itemSelector: string; mode: 'text' | 'attribute'; attributeName?: string },
  ): Promise<Result<string[], Error>> {
    this.calls.push({ method: 'extractList', args: [selectors, options] });
    const failed = this.fail('extractList');
    if (failed) return failed;
    return { ok: true, data: ['a', 'b'] };
  }

  async close(): Promise<void> {
    this.closed += 1;
  }

  private okVoidOrFail(method: keyof WorkflowRuntime): Result<void, Error> {
    const failed = this.fail(method);
    if (failed) return failed;
    return { ok: true, data: undefined };
  }

  private fail<T>(method: keyof WorkflowRuntime): Result<T, Error> | null {
    const message = this.overrides.shouldFail?.[method];
    if (!message) return null;
    return { ok: false, error: new Error(message) };
  }
}
