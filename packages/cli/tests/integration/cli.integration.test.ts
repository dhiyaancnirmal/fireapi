import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DiscoveryResult } from '@fireapi/browser';
import type { WorkflowGraph } from '@fireapi/core';
import { runCLI } from '../../src/index.js';

const originalExitCode = process.exitCode;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function simpleWorkflow(): WorkflowGraph {
  return {
    version: 2,
    id: 'wf-cli',
    name: 'CLI Workflow',
    sourceUrl: 'https://example.com',
    steps: [
      {
        id: 'assert-1',
        type: 'assert',
        config: {
          type: 'assert',
          leftRef: 'params.query',
          operator: 'exists',
        },
        selectors: [],
        timeout: 1000,
        retries: 0,
        onFailure: 'abort',
      },
    ],
    edges: [],
    inputParameters: [
      {
        name: 'query',
        type: 'string',
        required: true,
        description: 'query',
        linkedStepId: 'assert-1',
      },
    ],
    extractionTargets: [],
  };
}

function discoveryFixture(): DiscoveryResult {
  return {
    url: 'https://example.com/search',
    timestamp: new Date().toISOString(),
    elements: [],
    tables: [],
    forms: [],
    paginationControls: [],
    dependencies: [],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.exitCode = originalExitCode;
});

describe('fireapi CLI', () => {
  it('returns exit code 2 for invalid workflow validation', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'fireapi-cli-'));
    const workflowPath = path.join(tmpDir, 'workflow.json');
    await writeFile(workflowPath, JSON.stringify(simpleWorkflow()), 'utf8');

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/workflows/validate')) {
        return jsonResponse({
          valid: false,
          issues: [{ code: 'bad_graph', message: 'Bad graph', severity: 'error' }],
        });
      }
      return jsonResponse({}, 404);
    });

    vi.stubGlobal('fetch', fetchMock);

    const exitCode = await runCLI([
      '--server-url',
      'http://127.0.0.1:3001',
      'workflow',
      'validate',
      '--workflow',
      workflowPath,
    ]);

    expect(exitCode).toBe(2);
  });

  it('writes discovery and generated workflow output files', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'fireapi-cli-'));
    const discoveryOut = path.join(tmpDir, 'discovery.json');
    const workflowOut = path.join(tmpDir, 'generated-workflow.json');

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/v1/discovery')) {
        return jsonResponse({ discovery: discoveryFixture() });
      }
      if (url.includes('/v1/workflows/generate')) {
        const requestBody = init?.body ? JSON.parse(String(init.body)) : {};
        const discovery = requestBody.discovery as DiscoveryResult;
        return jsonResponse({
          workflow: {
            ...simpleWorkflow(),
            sourceUrl: discovery.url,
          },
          warnings: [],
          confidenceSummary: { score: 0.9, reasons: ['fixture'] },
        });
      }
      return jsonResponse({}, 404);
    });

    vi.stubGlobal('fetch', fetchMock);

    const discoverExit = await runCLI([
      '--server-url',
      'http://127.0.0.1:3001',
      'discover',
      '--url',
      'https://example.com/search',
      '--out',
      discoveryOut,
    ]);
    expect(discoverExit).toBe(0);

    const generateExit = await runCLI([
      '--server-url',
      'http://127.0.0.1:3001',
      'workflow',
      'generate',
      '--discovery',
      discoveryOut,
      '--out',
      workflowOut,
    ]);
    expect(generateExit).toBe(0);

    const discoverySaved = JSON.parse(await readFile(discoveryOut, 'utf8')) as DiscoveryResult;
    const workflowSaved = JSON.parse(await readFile(workflowOut, 'utf8')) as WorkflowGraph;

    expect(discoverySaved.url).toBe('https://example.com/search');
    expect(workflowSaved.id).toBe('wf-cli');
  });

  it('waits for run completion and exits 0 on success', async () => {
    const statuses = ['queued', 'running', 'succeeded'];
    let statusIndex = 0;

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/runs') && !url.endsWith('/cancel')) {
        if (url.endsWith('/v1/runs')) {
          return jsonResponse(
            {
              runId: 'run-1',
              status: 'queued',
              createdAt: new Date().toISOString(),
            },
            202,
          );
        }

        const status = statuses[Math.min(statusIndex, statuses.length - 1)];
        statusIndex += 1;
        return jsonResponse({
          runId: 'run-1',
          status,
          input: { query: 'alpha' },
          createdAt: new Date().toISOString(),
        });
      }
      return jsonResponse({}, 404);
    });

    vi.stubGlobal('fetch', fetchMock);

    const exitCode = await runCLI([
      '--server-url',
      'http://127.0.0.1:3001',
      'run',
      'create',
      '--workflow-id',
      'wf-1',
      '--input',
      '{"query":"alpha"}',
      '--wait',
    ]);

    expect(exitCode).toBe(0);
  });

  it('starts and finalizes recorder session with JSON output', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'fireapi-cli-'));
    const outPath = path.join(tmpDir, 'finalized.json');

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/v1/recorder/sessions') && init?.method === 'POST') {
        const parsed = init.body ? JSON.parse(String(init.body)) : {};
        if (url.includes('/finalize')) {
          return jsonResponse({
            workflow: simpleWorkflow(),
            issues: [],
            warnings: [],
            ...(parsed.register ? { registeredWorkflowId: 'wf-cli' } : {}),
          });
        }

        return jsonResponse({
          session: {
            id: 'rec-1',
            name: parsed.name ?? null,
            status: 'active',
            startUrl: parsed.url ?? 'https://example.com',
            currentUrl: parsed.url ?? 'https://example.com',
            firecrawlSessionId: 'fc-1',
            liveViewUrl: 'https://liveview.example.com/fc-1',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            finishedAt: null,
          },
          initialDiscovery: discoveryFixture(),
        });
      }
      if (url.includes('/v1/health')) {
        return jsonResponse({
          ok: true,
          service: 'fireapi-server',
          version: '0.1.0',
          time: new Date().toISOString(),
        });
      }
      return jsonResponse({}, 404);
    });

    vi.stubGlobal('fetch', fetchMock);

    const startExit = await runCLI([
      '--server-url',
      'http://127.0.0.1:3001',
      'recorder',
      'start',
      '--url',
      'https://example.com',
      '--name',
      'session-1',
    ]);
    expect(startExit).toBe(0);

    const finalizeExit = await runCLI([
      '--server-url',
      'http://127.0.0.1:3001',
      'recorder',
      'finalize',
      '--session-id',
      'rec-1',
      '--register',
      '--out',
      outPath,
      '--json',
    ]);
    expect(finalizeExit).toBe(0);

    const finalized = JSON.parse(await readFile(outPath, 'utf8')) as {
      registeredWorkflowId?: string;
    };
    expect(finalized.registeredWorkflowId).toBe('wf-cli');
  });
});
