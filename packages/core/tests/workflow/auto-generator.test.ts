import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { DiscoveryResult } from '@fireapi/browser';
import { AutoWorkflowGenerator, WorkflowGraphValidator } from '../../src/index.js';

function loadDiscoveryFixture(): DiscoveryResult {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'tests/fixtures/discovery-results/simple-search.json'),
      'utf-8',
    ),
  ) as DiscoveryResult;
}

describe('AutoWorkflowGenerator', () => {
  it('generates a valid workflow from discovery data', () => {
    const generator = new AutoWorkflowGenerator();
    const validator = new WorkflowGraphValidator();

    const result = generator.generate(loadDiscoveryFixture(), { name: 'Auto Search' });

    expect(result.workflow.version).toBe(2);
    expect(result.workflow.steps.some((step) => step.type === 'navigate')).toBe(true);
    expect(result.workflow.steps.some((step) => step.type === 'extract')).toBe(true);

    const validation = validator.validate(result.workflow);
    expect(validation.ok).toBe(true);
  });

  it('adds warnings when table is missing', () => {
    const generator = new AutoWorkflowGenerator();
    const discovery = loadDiscoveryFixture();
    discovery.tables = [];

    const result = generator.generate(discovery);
    expect(result.warnings.some((warning) => warning.code === 'no_table_detected')).toBe(true);
  });
});
