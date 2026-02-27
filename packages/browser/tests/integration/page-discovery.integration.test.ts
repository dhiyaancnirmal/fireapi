import { PageDiscovery } from '../../src/discovery/page-discovery.js';
import { MockPage, asPlaywrightPage } from '../fixtures/mock-page.js';
import { type FixtureServerHandle, startFixtureServer } from '../fixtures/server.js';

let fixtureServer: FixtureServerHandle;

beforeAll(async () => {
  fixtureServer = await startFixtureServer();
});

afterAll(async () => {
  await fixtureServer.close();
});

describe('PageDiscovery (fixture-backed)', () => {
  it('discovers inputs, selects, button, and table on simple-search fixture', async () => {
    const page = new MockPage();
    const url = fixtureServer.urlFor('simple-search.html');
    await page.goto(url);

    const discovery = new PageDiscovery();
    const result = await discovery.discoverFromPage(asPlaywrightPage(page), {
      url,
      includeTables: true,
      includePagination: true,
      detectDependencies: false,
      waitUntil: 'load',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.elements.length).toBeGreaterThanOrEqual(3);
    expect(result.data.elements.some((el) => el.type === 'text_input')).toBe(true);
    expect(result.data.elements.some((el) => el.type === 'select')).toBe(true);
    expect(result.data.tables.length).toBeGreaterThanOrEqual(1);
    expect(result.data.elements.every((el) => el.selectors.length > 0)).toBe(true);
  });

  it('enumerates select options and supports dynamic-content fixture after scripts run', async () => {
    const discovery = new PageDiscovery();

    const dropdownPage = new MockPage();
    const dropdownUrl = fixtureServer.urlFor('dropdown-form.html');
    await dropdownPage.goto(dropdownUrl);
    const dropdownResult = await discovery.discoverFromPage(asPlaywrightPage(dropdownPage), {
      url: dropdownUrl,
      detectDependencies: false,
    });
    expect(dropdownResult.ok).toBe(true);
    if (dropdownResult.ok) {
      const selects = dropdownResult.data.elements.filter((el) => el.type === 'select');
      expect(selects.length).toBeGreaterThanOrEqual(2);
      expect(selects[0].options?.length ?? 0).toBeGreaterThan(0);
    }

    const dynamicPage = new MockPage();
    const dynamicUrl = fixtureServer.urlFor('dynamic-content.html');
    await dynamicPage.goto(dynamicUrl);
    await dynamicPage.waitForTimeout(30);
    const dynamicResult = await discovery.discoverFromPage(asPlaywrightPage(dynamicPage), {
      url: dynamicUrl,
      includeTables: false,
      includePagination: false,
    });
    expect(dynamicResult.ok).toBe(true);
    if (dynamicResult.ok) {
      expect(dynamicResult.data.elements.some((el) => el.name === 'query')).toBe(true);
    }
  });

  it('detects pagination controls on paginated-results fixture', async () => {
    const page = new MockPage();
    const url = fixtureServer.urlFor('paginated-results.html');
    await page.goto(url);

    const discovery = new PageDiscovery();
    const result = await discovery.discoverFromPage(asPlaywrightPage(page), { url });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.paginationControls.length).toBeGreaterThanOrEqual(3);
      expect(result.data.paginationControls.some((c) => c.kind === 'next')).toBe(true);
    }
  });

  it('infers table sample rows and column types on data-table fixture', async () => {
    const page = new MockPage();
    const url = fixtureServer.urlFor('data-table.html');
    await page.goto(url);

    const discovery = new PageDiscovery();
    const result = await discovery.discoverFromPage(asPlaywrightPage(page), { url });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.tables).toHaveLength(1);
      expect(result.data.tables[0].headers).toEqual([
        'Record ID',
        'Created Date',
        'Active',
        'Amount',
        'Link',
      ]);
      expect(result.data.tables[0].columnTypes).toEqual([
        'number',
        'date',
        'boolean',
        'number',
        'url',
      ]);
    }
  });
});
