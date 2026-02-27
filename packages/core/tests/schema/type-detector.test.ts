import { describe, expect, it } from 'vitest';

import { TypeDetector } from '../../src/index.js';

describe('TypeDetector', () => {
  it('detects scalar kinds', () => {
    const detector = new TypeDetector();

    expect(detector.detectKind('hello')).toBe('string');
    expect(detector.detectKind(42)).toBe('number');
    expect(detector.detectKind(true)).toBe('boolean');
    expect(detector.detectKind('2026-01-01')).toBe('date');
    expect(detector.detectKind('https://example.com')).toBe('url');
    expect(detector.detectKind(null)).toBe('null');
  });

  it('produces observations', () => {
    const detector = new TypeDetector();
    const observation = detector.observe(['a', 'b', 'a', '', null, 1]);

    expect(observation.count).toBe(6);
    expect(observation.nullCount).toBe(1);
    expect(observation.uniqueValues.length).toBeGreaterThan(0);
  });
});
