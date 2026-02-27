import { ElementInteraction } from '../../src/interaction/element-interaction.js';
import { SelectorEngine } from '../../src/selectors/selector-engine.js';
import { MockPage, asPlaywrightPage } from '../fixtures/mock-page.js';
import { type FixtureServerHandle, startFixtureServer } from '../fixtures/server.js';

let fixtureServer: FixtureServerHandle;

beforeAll(async () => {
  fixtureServer = await startFixtureServer();
});

afterAll(async () => {
  await fixtureServer.close();
});

describe('ElementInteraction (fixture-backed)', () => {
  it('fills/selects/clicks and extracts results table on simple-search fixture', async () => {
    const page = new MockPage();
    const url = fixtureServer.urlFor('simple-search.html');
    await page.goto(url);

    const interaction = new ElementInteraction(new SelectorEngine());
    const pwPage = asPlaywrightPage(page);

    expect(
      (
        await interaction.fill(
          pwPage,
          [{ type: 'css', value: 'css=#owner', confidence: 1 }],
          'Smith',
          {
            waitForVisible: true,
            timeoutMs: 500,
          },
        )
      ).ok,
    ).toBe(true);

    expect(
      (
        await interaction.select(
          pwPage,
          [{ type: 'css', value: 'css=#county', confidence: 1 }],
          'dallas',
        )
      ).ok,
    ).toBe(true);

    expect(
      (await interaction.click(pwPage, [{ type: 'css', value: 'css=#search-btn', confidence: 1 }]))
        .ok,
    ).toBe(true);

    const table = await interaction.extractTable(pwPage, [
      { type: 'css', value: 'css=#results', confidence: 1 },
    ]);
    expect(table.ok).toBe(true);
    if (table.ok) {
      expect(table.data.rows.length).toBe(2);
      expect(table.data.rows[0]).toMatchObject({ 'Parcel ID': '1001', Owner: 'SMITH, JOHN' });
    }
  });
});
