import { SelectorEngine } from '../../src/selectors/selector-engine.js';
import type { SelectorStrategy } from '../../src/types.js';
import { MockPage, asPlaywrightPage } from '../fixtures/mock-page.js';

describe('SelectorEngine', () => {
  it('generates deterministic multi-strategy candidates', () => {
    const engine = new SelectorEngine();
    const candidates = engine.generateCandidates({
      tagName: 'input',
      attributes: {
        id: 'owner',
        name: 'owner_name',
        placeholder: 'Owner Name',
        'aria-label': 'Owner Name',
        type: 'text',
      },
      labelText: 'Owner Name',
      domPath: [1, 0, 2],
    });

    expect(candidates.map((candidate) => candidate.type)).toEqual(
      expect.arrayContaining(['css', 'xpath', 'aria', 'position']),
    );

    const candidates2 = engine.generateCandidates({
      tagName: 'input',
      attributes: {
        id: 'owner',
        name: 'owner_name',
        placeholder: 'Owner Name',
        'aria-label': 'Owner Name',
        type: 'text',
      },
      labelText: 'Owner Name',
      domPath: [1, 0, 2],
    });

    expect(candidates).toEqual(candidates2);
  });

  it('resolves the first working selector preferring higher confidence', async () => {
    const mock = new MockPage();
    await mock.setContent(
      `<!doctype html><html><body><input id="owner" name="owner"></body></html>`,
    );

    const engine = new SelectorEngine();
    const selectors: SelectorStrategy[] = [
      { type: 'position', value: 'css=html > *:nth-child(99)', confidence: 0.1 },
      { type: 'css', value: 'css=#owner', confidence: 0.98 },
      { type: 'xpath', value: "xpath=//*[@id='owner']", confidence: 0.88 },
    ];

    const resolved = await engine.resolveFirst(asPlaywrightPage(mock), selectors);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.data.value).toBe('css=#owner');
    }
  });

  it('returns SelectorError when no selectors match', async () => {
    const mock = new MockPage();
    await mock.setContent('<!doctype html><html><body><div>No inputs</div></body></html>');

    const engine = new SelectorEngine();
    const result = await engine.resolveFirst(asPlaywrightPage(mock), [
      { type: 'css', value: 'css=#missing', confidence: 1 },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SELECTOR_NOT_FOUND');
      expect(result.error.selectorsTried).toEqual(['css=#missing']);
    }
  });
});
