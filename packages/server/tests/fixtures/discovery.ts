import type { DiscoveryResult } from '@fireapi/browser';

export function createDiscoveryFixture(): DiscoveryResult {
  return {
    url: 'https://example.com/search',
    timestamp: new Date().toISOString(),
    elements: [
      {
        id: 'element-owner',
        type: 'text_input',
        tagName: 'input',
        inputType: 'text',
        name: 'owner',
        label: 'Owner',
        placeholder: 'Owner name',
        ariaLabel: null,
        selectors: [{ type: 'css', value: 'css=#owner', confidence: 0.99 }],
        required: true,
        formId: 'search-form',
        attributes: { id: 'owner', name: 'owner', type: 'text' },
      },
      {
        id: 'element-submit',
        type: 'submit',
        tagName: 'button',
        inputType: null,
        name: null,
        label: 'Search',
        placeholder: null,
        ariaLabel: null,
        selectors: [{ type: 'css', value: 'css=#search', confidence: 0.95 }],
        required: false,
        formId: 'search-form',
        attributes: { id: 'search' },
      },
    ],
    tables: [
      {
        selectors: [{ type: 'css', value: 'css=#results', confidence: 0.95 }],
        headers: ['Owner'],
        columnTypes: ['string'],
        sampleRows: [{ Owner: 'Alice' }],
        rowCount: 1,
        hasPagination: false,
      },
    ],
    forms: [
      {
        id: 'search-form',
        name: 'search',
        action: '/search',
        method: 'get',
        selectors: [{ type: 'css', value: 'css=#search-form', confidence: 0.9 }],
        elementIds: ['element-owner', 'element-submit'],
      },
    ],
    paginationControls: [],
    dependencies: [],
  };
}
