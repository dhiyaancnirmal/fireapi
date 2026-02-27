import tokens from '../../../design-system/firecrawl-brand.tokens.json';
import firecrawlPreset from '../../../design-system/tailwind.firecrawl.preset';

import { describe, expect, it } from 'vitest';

describe('design-system integration', () => {
  it('uses canonical Firecrawl token colors', () => {
    expect(tokens.color.primary).toBe('#FF4C00');
    expect(tokens.color.text).toBe('#262626');
    expect(tokens.color.background).toBe('#F9F9F9');
  });

  it('loads tailwind preset brand colors', () => {
    const colors = firecrawlPreset.theme?.extend?.colors as
      | { brand?: { primary?: string; text?: string; background?: string } }
      | undefined;

    expect(colors?.brand?.primary).toBe('#FF4C00');
    expect(colors?.brand?.text).toBe('#262626');
    expect(colors?.brand?.background).toBe('#F9F9F9');
  });
});
