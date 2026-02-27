import type { SelectorEngine } from '../selectors/selector-engine.js';
import type {
  DiscoveredTable,
  RawDomSnapshotTable,
  SelectorGenerateInput,
  SelectorStrategy,
  TableColumnType,
} from '../types.js';

function inferScalarType(value: string): TableColumnType {
  const normalized = value.trim();
  if (!normalized) {
    return 'unknown';
  }
  if (/^(true|false|yes|no)$/i.test(normalized)) {
    return 'boolean';
  }
  if (/^[+-]?[\d,.]+$/.test(normalized.replace(/\$/g, ''))) {
    return 'number';
  }
  if (/^https?:\/\//i.test(normalized)) {
    return 'url';
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(normalized)) {
    return 'date';
  }
  return 'string';
}

function combineColumnType(current: TableColumnType, next: TableColumnType): TableColumnType {
  if (current === 'unknown') {
    return next;
  }
  if (next === 'unknown') {
    return current;
  }
  if (current === next) {
    return current;
  }
  return 'string';
}

function tableSelectorInput(table: RawDomSnapshotTable): SelectorGenerateInput {
  const attributes: Record<string, string> = {};
  if (table.id) {
    attributes.id = table.id;
  }
  if (table.className) {
    attributes.class = table.className;
  }
  return {
    tagName: 'table',
    attributes,
    domPath: table.domPath,
    textContent: table.headers.join(' '),
  };
}

export function buildDiscoveredTables(
  rawTables: RawDomSnapshotTable[],
  selectorEngine: SelectorEngine,
  options: { maxSampleRows?: number } = {},
): DiscoveredTable[] {
  const maxSampleRows = options.maxSampleRows ?? 5;

  return rawTables.map((table) => {
    const headers = table.headers.filter((header) => header.length > 0);
    const sampleMatrix = table.rows.slice(0, maxSampleRows);
    const width = Math.max(headers.length, ...sampleMatrix.map((row) => row.length), 0);
    const normalizedHeaders = Array.from(
      { length: width },
      (_, index) => headers[index] ?? `column_${index + 1}`,
    );

    const columnTypes = Array.from({ length: width }, () => 'unknown' as TableColumnType);
    const sampleRows = sampleMatrix.map((cells) => {
      const row: Record<string, string> = {};
      for (let index = 0; index < width; index += 1) {
        const value = cells[index] ?? '';
        const headerKey = normalizedHeaders[index] ?? `column_${index + 1}`;
        const currentType = columnTypes[index] ?? 'unknown';
        row[headerKey] = value;
        columnTypes[index] = combineColumnType(currentType, inferScalarType(value));
      }
      return row;
    });

    const selectors: SelectorStrategy[] = selectorEngine.generateCandidates(
      tableSelectorInput(table),
    );

    return {
      selectors,
      headers: normalizedHeaders,
      columnTypes,
      sampleRows,
      rowCount: table.rowCount,
      hasPagination: false,
    };
  });
}
