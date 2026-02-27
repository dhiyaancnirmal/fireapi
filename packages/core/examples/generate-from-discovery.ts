import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { DiscoveryResult } from '@fireapi/browser';

import { AutoWorkflowGenerator, WorkflowSerializer } from '../src/index.js';

const fixturePath = resolve(process.cwd(), 'tests/fixtures/discovery-results/simple-search.json');
const discovery = JSON.parse(readFileSync(fixturePath, 'utf-8')) as DiscoveryResult;

const generator = new AutoWorkflowGenerator();
const serializer = new WorkflowSerializer({ validateOnStringify: true });
const generated = generator.generate(discovery, { name: 'Generated Search Workflow' });
const serialized = serializer.stringify(generated.workflow);

if (!serialized.ok) {
  throw serialized.error;
}

console.log(serialized.data);
