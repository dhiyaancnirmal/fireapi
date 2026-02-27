import type { SelectorEngine } from '../selectors/selector-engine.js';
import type {
  PaginationControl,
  RawDomSnapshotPaginationControl,
  SelectorGenerateInput,
} from '../types.js';

function paginationSelectorInput(control: RawDomSnapshotPaginationControl): SelectorGenerateInput {
  const attributes = { ...control.attributes };
  if (control.id) {
    attributes.id = control.id;
  }
  if (control.ariaLabel) {
    attributes['aria-label'] = control.ariaLabel;
  }
  return {
    tagName: control.tagName,
    attributes,
    textContent: control.label,
    domPath: control.domPath,
    labelText: control.label,
  };
}

export function buildPaginationControls(
  rawControls: RawDomSnapshotPaginationControl[],
  selectorEngine: SelectorEngine,
): PaginationControl[] {
  return rawControls.map((control) => {
    const base = {
      kind: (control.kindHint === 'unknown'
        ? 'load_more'
        : control.kindHint) as PaginationControl['kind'],
      label: control.label,
      selectors: selectorEngine.generateCandidates(paginationSelectorInput(control)),
    };
    return typeof control.pageNumber === 'number'
      ? { ...base, pageNumber: control.pageNumber }
      : base;
  });
}
