import { DependencyDetector } from '../../src/discovery/dependency-detector.js';
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

describe('DependencyDetector (fixture-backed)', () => {
  it('detects cascading select option changes', async () => {
    const page = new MockPage();
    const url = fixtureServer.urlFor('dropdown-form.html');
    await page.goto(url);

    const discovery = new PageDiscovery();
    const discoveryResult = await discovery.discoverFromPage(asPlaywrightPage(page), {
      url,
      detectDependencies: false,
    });
    expect(discoveryResult.ok).toBe(true);
    if (!discoveryResult.ok) return;

    const detector = new DependencyDetector();
    const dependencies = await detector.detectCascadingSelects(
      asPlaywrightPage(page),
      discoveryResult.data.elements,
      { maxPairs: 10, maxSourceOptions: 5, settleMs: 5 },
    );

    expect(dependencies.length).toBeGreaterThanOrEqual(1);
    expect(dependencies[0].type).toBe('cascading_options');
    expect(Object.keys(dependencies[0].observedValues).length).toBeGreaterThan(0);
  });
});
