import type { SelectorEngine } from '../selectors/selector-engine.js';
import type {
  DiscoveredElement,
  DiscoveredForm,
  RawDomSnapshotForm,
  SelectorGenerateInput,
} from '../types.js';

function formSelectorInput(form: RawDomSnapshotForm): SelectorGenerateInput {
  const attributes: Record<string, string> = {};
  if (form.id) {
    attributes.id = form.id;
  }
  if (form.name) {
    attributes.name = form.name;
  }
  return {
    tagName: 'form',
    attributes,
    domPath: form.domPath,
    textContent: form.name,
  };
}

export function buildDiscoveredForms(
  rawForms: RawDomSnapshotForm[],
  elements: DiscoveredElement[],
  selectorEngine: SelectorEngine,
): DiscoveredForm[] {
  return rawForms.map((form) => ({
    id: form.id,
    name: form.name,
    action: form.action,
    method: form.method,
    selectors: selectorEngine.generateCandidates(formSelectorInput(form)),
    elementIds: elements
      .filter((element) => element.formId === form.id)
      .map((element) => element.id),
  }));
}
