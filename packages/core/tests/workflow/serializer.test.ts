import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { type WorkflowGraph, WorkflowSerializer } from '../../src/index.js';

function loadWorkflowFixture(): WorkflowGraph {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), 'tests/fixtures/workflows/basic-search.json'), 'utf-8'),
  ) as WorkflowGraph;
}

describe('WorkflowSerializer', () => {
  it('stringifies deterministically', () => {
    const serializer = new WorkflowSerializer();
    const workflow = loadWorkflowFixture();

    const a = serializer.stringify(workflow);
    const b = serializer.stringify(workflow);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.data).toBe(b.data);
    }
  });

  it('parses and validates workflow json', () => {
    const serializer = new WorkflowSerializer();
    const raw = readFileSync(
      resolve(process.cwd(), 'tests/fixtures/workflows/basic-search.json'),
      'utf-8',
    );

    const parsed = serializer.parse(raw);
    expect(parsed.ok).toBe(true);
  });

  it('produces diff entries', () => {
    const serializer = new WorkflowSerializer();
    const a = loadWorkflowFixture();
    const b = loadWorkflowFixture();
    b.name = 'Updated Name';

    const diff = serializer.diff(a, b);
    expect(diff.length).toBeGreaterThan(0);
    expect(diff.some((entry) => entry.path.includes('name'))).toBe(true);
  });
});
