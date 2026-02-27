import { buildDiscoveredTables } from '../../src/discovery/table-detector.js';
import { SelectorEngine } from '../../src/selectors/selector-engine.js';
import type { RawDomSnapshotTable } from '../../src/types.js';

describe('buildDiscoveredTables', () => {
  it('infers column types from sample rows', () => {
    const rawTable: RawDomSnapshotTable = {
      id: 'records-table',
      className: null,
      headers: ['Amount', 'Created', 'Active', 'Website', 'Name'],
      rows: [
        ['123', '2026-02-26', 'true', 'https://example.com', 'Alice'],
        ['456', '2026-02-27', 'false', 'https://example.com/2', 'Bob'],
      ],
      rowCount: 2,
      domPath: [1, 0],
    };

    const [table] = buildDiscoveredTables([rawTable], new SelectorEngine());
    expect(table.headers).toEqual(rawTable.headers);
    expect(table.columnTypes).toEqual(['number', 'date', 'boolean', 'url', 'string']);
    expect(table.sampleRows).toHaveLength(2);
  });
});
