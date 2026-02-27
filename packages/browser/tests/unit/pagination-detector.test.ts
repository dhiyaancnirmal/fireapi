import { buildPaginationControls } from '../../src/discovery/pagination-detector.js';
import { SelectorEngine } from '../../src/selectors/selector-engine.js';
import type { RawDomSnapshotPaginationControl } from '../../src/types.js';

describe('buildPaginationControls', () => {
  it('maps raw controls to typed pagination controls', () => {
    const rawControls: RawDomSnapshotPaginationControl[] = [
      {
        kindHint: 'number',
        label: '2',
        pageNumber: 2,
        tagName: 'a',
        id: 'page-2',
        className: null,
        ariaLabel: null,
        domPath: [1, 0, 1],
        attributes: { id: 'page-2' },
      },
      {
        kindHint: 'next',
        label: 'Next',
        tagName: 'button',
        id: 'next-btn',
        className: null,
        ariaLabel: 'Next page',
        domPath: [1, 0, 2],
        attributes: { id: 'next-btn', 'aria-label': 'Next page' },
      },
    ];

    const controls = buildPaginationControls(rawControls, new SelectorEngine());
    expect(controls).toHaveLength(2);
    expect(controls[0]).toMatchObject({ kind: 'number', pageNumber: 2 });
    expect(controls[1]).toMatchObject({ kind: 'next' });
    expect(controls[1].selectors.length).toBeGreaterThan(0);
  });
});
