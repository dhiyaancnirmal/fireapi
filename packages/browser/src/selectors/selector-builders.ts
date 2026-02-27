import type { SelectorGenerateInput, SelectorStrategy } from '../types.js';

function escapeCssValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function escapeXPathLiteral(value: string): string {
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  const parts = value.split("'").map((part) => `'${part}'`);
  return `concat(${parts.join(', "\'", ')})`;
}

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed : null;
}

function buildCssSelectors(input: SelectorGenerateInput): SelectorStrategy[] {
  const selectors: SelectorStrategy[] = [];
  const tagName = input.tagName.toLowerCase();
  const attrs = input.attributes;
  const id = attrs.id;
  const name = attrs.name;
  const placeholder = attrs.placeholder;
  const formId = input.formContext?.id ?? null;

  if (id) {
    selectors.push({
      type: 'css',
      value: `css=#${escapeCssValue(id)}`,
      confidence: 0.98,
    });
  }

  if (name) {
    selectors.push({
      type: 'css',
      value: `css=${tagName}[name=\"${escapeCssValue(name)}\"]`,
      confidence: 0.92,
    });

    if (formId) {
      selectors.push({
        type: 'css',
        value: `css=form#${escapeCssValue(formId)} ${tagName}[name=\"${escapeCssValue(name)}\"]`,
        confidence: 0.95,
      });
    }
  }

  if (placeholder) {
    selectors.push({
      type: 'css',
      value: `css=${tagName}[placeholder=\"${escapeCssValue(placeholder)}\"]`,
      confidence: 0.8,
    });
  }

  const type = attrs.type;
  if (type && ['submit', 'button', 'search'].includes(type)) {
    selectors.push({
      type: 'css',
      value: `css=${tagName}[type=\"${escapeCssValue(type)}\"]`,
      confidence: 0.7,
    });
  }

  return selectors;
}

function buildXPathSelectors(input: SelectorGenerateInput): SelectorStrategy[] {
  const selectors: SelectorStrategy[] = [];
  const tagName = input.tagName.toLowerCase();
  const attrs = input.attributes;

  if (attrs.id) {
    selectors.push({
      type: 'xpath',
      value: `xpath=//*[@id=${escapeXPathLiteral(attrs.id)}]`,
      confidence: 0.88,
    });
  }

  if (attrs.name) {
    selectors.push({
      type: 'xpath',
      value: `xpath=//${tagName}[@name=${escapeXPathLiteral(attrs.name)}]`,
      confidence: 0.74,
    });
  }

  return selectors;
}

function buildAriaSelectors(input: SelectorGenerateInput): SelectorStrategy[] {
  const selectors: SelectorStrategy[] = [];
  const ariaLabel = normalizeText(input.attributes['aria-label']);
  const labelText = normalizeText(input.labelText);

  if (ariaLabel) {
    selectors.push({ type: 'aria', value: `aria=${ariaLabel}`, confidence: 0.9 });
  }

  if (labelText) {
    selectors.push({ type: 'aria', value: `aria=${labelText}`, confidence: 0.85 });
  }

  return selectors;
}

function buildTextSelectors(input: SelectorGenerateInput): SelectorStrategy[] {
  const selectors: SelectorStrategy[] = [];
  const text = normalizeText(input.textContent) ?? normalizeText(input.labelText);
  if (!text) {
    return selectors;
  }

  if (text.length <= 120) {
    selectors.push({
      type: 'text',
      value: `text=${text}`,
      confidence: 0.62,
    });
  }

  return selectors;
}

function buildPositionSelector(input: SelectorGenerateInput): SelectorStrategy[] {
  if (!input.domPath || input.domPath.length === 0) {
    return [];
  }

  const segments = input.domPath.map((index) => `*:nth-child(${index + 1})`);
  return [
    {
      type: 'position',
      value: `css=html > ${segments.join(' > ')}`,
      confidence: 0.2,
    },
  ];
}

export function dedupeSelectors(selectors: SelectorStrategy[]): SelectorStrategy[] {
  const seen = new Set<string>();
  const unique: SelectorStrategy[] = [];

  for (const selector of selectors) {
    const key = `${selector.type}:${selector.value}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(selector);
  }

  return unique;
}

export function buildSelectorCandidates(input: SelectorGenerateInput): SelectorStrategy[] {
  return dedupeSelectors([
    ...buildCssSelectors(input),
    ...buildXPathSelectors(input),
    ...buildAriaSelectors(input),
    ...buildTextSelectors(input),
    ...buildPositionSelector(input),
  ]);
}
