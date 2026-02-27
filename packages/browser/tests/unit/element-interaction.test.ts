import { ElementInteraction } from '../../src/interaction/element-interaction.js';
import { SelectorEngine } from '../../src/selectors/selector-engine.js';
import type { SelectorStrategy } from '../../src/types.js';
import { MockPage, asPlaywrightPage } from '../fixtures/mock-page.js';

describe('ElementInteraction', () => {
  it('fills/selects/clicks and extracts a table', async () => {
    const page = new MockPage();
    await page.setContent(`
      <!doctype html>
      <html><body>
        <label for="owner">Owner</label>
        <input id="owner" name="owner" />
        <select id="county" name="county">
          <option value="harris">Harris</option>
          <option value="dallas">Dallas</option>
        </select>
        <button id="search">Search</button>
        <table id="results" style="display:none">
          <thead><tr><th>ID</th><th>Name</th></tr></thead>
          <tbody></tbody>
        </table>
        <script>
          document.getElementById('search').addEventListener('click', () => {
            const table = document.getElementById('results');
            table.style.display = 'table';
            document.querySelector('#results tbody').innerHTML = '<tr><td>1</td><td>Alice</td></tr>';
          });
        </script>
      </body></html>
    `);

    const interaction = new ElementInteraction(new SelectorEngine());
    const pwPage = asPlaywrightPage(page);

    const inputSelectors: SelectorStrategy[] = [
      { type: 'css', value: 'css=#owner', confidence: 1 },
    ];
    const selectSelectors: SelectorStrategy[] = [
      { type: 'css', value: 'css=#county', confidence: 1 },
    ];
    const buttonSelectors: SelectorStrategy[] = [
      { type: 'css', value: 'css=#search', confidence: 1 },
    ];
    const tableSelectors: SelectorStrategy[] = [
      { type: 'css', value: 'css=#results', confidence: 1 },
    ];

    expect((await interaction.fill(pwPage, inputSelectors, 'Smith')).ok).toBe(true);
    expect((await interaction.select(pwPage, selectSelectors, 'dallas')).ok).toBe(true);
    expect((await interaction.click(pwPage, buttonSelectors)).ok).toBe(true);
    expect((await interaction.waitFor(pwPage, tableSelectors, { timeoutMs: 500 })).ok).toBe(true);

    const extracted = await interaction.extractTable(pwPage, tableSelectors, { sampleRows: 5 });
    expect(extracted.ok).toBe(true);
    if (extracted.ok) {
      expect(extracted.data.headers).toEqual(['ID', 'Name']);
      expect(extracted.data.rows[0]).toEqual({ ID: '1', Name: 'Alice' });
      expect(extracted.data.rowCount).toBe(1);
    }
  });

  it('returns selector error with tried selectors when target is missing', async () => {
    const page = new MockPage('<!doctype html><html><body></body></html>');
    const interaction = new ElementInteraction(new SelectorEngine());
    const result = await interaction.click(asPlaywrightPage(page), [
      { type: 'css', value: 'css=#missing', confidence: 1 },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SELECTOR_NOT_FOUND');
      expect(result.error.details).toEqual({ selectorsTried: ['css=#missing'] });
    }
  });
});
