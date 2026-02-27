import type { Page } from 'playwright-core';
import { ulid } from 'ulid';

import { DiscoveryError, SessionError } from '../errors.js';
import { ElementInteraction } from '../interaction/element-interaction.js';
import { createBrowserLogger } from '../logger.js';
import { SelectorEngine } from '../selectors/selector-engine.js';
import { FirecrawlSessionManager } from '../session/firecrawl-session-manager.js';
import type {
  BrowserLease,
  BrowserPackageLogger,
  DiscoverPageOptions,
  DiscoveredElement,
  DiscoveryResult,
  RawDomSnapshot,
  RawDomSnapshotElement,
  Result,
  SelectorGenerateInput,
} from '../types.js';
import { DependencyDetector } from './dependency-detector.js';
import { captureDomSnapshot } from './dom-snapshot.js';
import { buildDiscoveredForms } from './form-detector.js';
import { buildPaginationControls } from './pagination-detector.js';
import { buildDiscoveredTables } from './table-detector.js';

interface InternalDiscoverPageOptions extends DiscoverPageOptions {
  __testLease?: BrowserLease;
}

function mapElementType(element: RawDomSnapshotElement): DiscoveredElement['type'] {
  if (element.tagName === 'textarea') {
    return 'textarea';
  }

  if (element.tagName === 'select') {
    return 'select';
  }

  if (element.tagName === 'button') {
    const lower = (element.textContent ?? '').toLowerCase();
    if (lower.includes('search') || lower.includes('submit')) {
      return 'submit';
    }
    return 'button';
  }

  const inputType = (element.inputType ?? 'text').toLowerCase();
  if (inputType === 'checkbox') {
    return 'checkbox';
  }
  if (inputType === 'radio') {
    return 'radio';
  }
  if (inputType === 'date') {
    return 'date_picker';
  }
  if (inputType === 'file') {
    return 'file_upload';
  }
  if (inputType === 'search') {
    return 'search';
  }
  if (inputType === 'submit') {
    return 'submit';
  }
  return 'text_input';
}

function buildElementSelectorInput(element: RawDomSnapshotElement): SelectorGenerateInput {
  const attributes = { ...element.attributes };
  if (element.id) {
    attributes.id = element.id;
  }
  if (element.name) {
    attributes.name = element.name;
  }
  if (element.placeholder) {
    attributes.placeholder = element.placeholder;
  }
  if (element.ariaLabel) {
    attributes['aria-label'] = element.ariaLabel;
  }
  if (element.inputType) {
    attributes.type = element.inputType;
  }

  return {
    tagName: element.tagName,
    attributes,
    labelText: element.label,
    textContent: element.textContent,
    formContext: { id: element.formId },
    domPath: element.domPath,
  };
}

function mapDiscoveredElements(
  raw: RawDomSnapshot,
  selectorEngine: SelectorEngine,
): DiscoveredElement[] {
  return raw.elements.map((element) => {
    const base = {
      id: ulid(),
      type: mapElementType(element),
      tagName: element.tagName,
      inputType: element.inputType,
      name: element.name,
      label: element.label,
      placeholder: element.placeholder,
      ariaLabel: element.ariaLabel,
      selectors: selectorEngine.generateCandidates(buildElementSelectorInput(element)),
      required: element.required,
      formId: element.formId,
      textContent: element.textContent,
      attributes: element.attributes,
    };
    return element.options ? { ...base, options: element.options } : base;
  });
}

function markPaginationTables(result: DiscoveryResult): DiscoveryResult {
  const hasPagination = result.paginationControls.length > 0;
  if (!hasPagination) {
    return result;
  }

  return {
    ...result,
    tables: result.tables.map((table) => ({ ...table, hasPagination: true })),
  };
}

export class PageDiscovery {
  private readonly selectorEngine: SelectorEngine;
  private readonly dependencyDetector: DependencyDetector;
  private readonly _interaction: ElementInteraction;
  private readonly logger: BrowserPackageLogger;

  constructor(deps?: {
    selectorEngine?: SelectorEngine;
    dependencyDetector?: DependencyDetector;
    interaction?: ElementInteraction;
    logger?: BrowserPackageLogger;
  }) {
    this.logger = deps?.logger ?? createBrowserLogger({ base: { module: 'page-discovery' } });
    this.selectorEngine = deps?.selectorEngine ?? new SelectorEngine(this.logger);
    this.dependencyDetector =
      deps?.dependencyDetector ??
      new DependencyDetector({ selectorEngine: this.selectorEngine, logger: this.logger });
    this._interaction =
      deps?.interaction ?? new ElementInteraction(this.selectorEngine, this.logger);
  }

  async discover(options: DiscoverPageOptions): Promise<Result<DiscoveryResult, DiscoveryError>> {
    return this.discoverInternal(options as InternalDiscoverPageOptions);
  }

  async discoverFromPage(
    page: Page,
    options: Omit<DiscoverPageOptions, 'sessionManager'>,
  ): Promise<Result<DiscoveryResult, DiscoveryError>> {
    const fakeLease = {
      session: {
        id: 'local-page',
        cdpUrl: 'local://page',
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        useCount: 0,
      },
      browser: {} as never,
      context: {} as never,
      page,
    } satisfies BrowserLease;
    return this.discoverInternal({ ...options, __testLease: fakeLease });
  }

  private async discoverInternal(
    options: InternalDiscoverPageOptions,
  ): Promise<Result<DiscoveryResult, DiscoveryError>> {
    const logger = options.logger ?? this.logger;
    const waitUntil = options.waitUntil ?? 'networkidle';
    const timeoutMs = options.timeoutMs ?? 15000;
    const includeTables = options.includeTables ?? true;
    const includePagination = options.includePagination ?? true;
    const detectDependencies = options.detectDependencies ?? false;
    const maxTableSampleRows = options.maxTableSampleRows ?? 5;

    let lease: BrowserLease | null = options.__testLease ?? null;
    let ownLease = false;
    let sessionManager = options.sessionManager ?? null;

    try {
      if (!lease) {
        sessionManager = sessionManager ?? this.createDefaultSessionManager(options);
        const acquired = await sessionManager.acquire();
        if (!acquired.ok) {
          throw acquired.error;
        }
        lease = acquired.data;
        ownLease = true;
      }

      const page = lease.page;
      await page.goto(options.url, { waitUntil, timeout: timeoutMs });
      const raw = await captureDomSnapshot(page);
      const elements = mapDiscoveredElements(raw, this.selectorEngine);
      const tables = includeTables
        ? buildDiscoveredTables(raw.tables, this.selectorEngine, {
            maxSampleRows: maxTableSampleRows,
          })
        : [];
      const forms = buildDiscoveredForms(raw.forms, elements, this.selectorEngine);
      const paginationControls = includePagination
        ? buildPaginationControls(raw.paginationControls, this.selectorEngine)
        : [];
      const dependencies = detectDependencies
        ? await this.dependencyDetector.detectCascadingSelects(page, elements)
        : [];

      const result = markPaginationTables({
        url: raw.url,
        timestamp: raw.timestamp,
        elements,
        tables,
        forms,
        paginationControls,
        dependencies,
      });

      logger.info?.(
        {
          url: options.url,
          elements: result.elements.length,
          tables: result.tables.length,
          paginationControls: result.paginationControls.length,
          dependencies: result.dependencies.length,
        },
        'Page discovery complete',
      );

      return { ok: true, data: result };
    } catch (error) {
      const details = {
        url: options.url,
        cause: error instanceof Error ? error.message : String(error),
      };
      if (error instanceof SessionError) {
        return {
          ok: false,
          error: new DiscoveryError('Failed to acquire a browser session', details),
        };
      }
      return { ok: false, error: new DiscoveryError('Page discovery failed', details) };
    } finally {
      if (lease && ownLease) {
        await sessionManager?.release(lease, 'ok');
      }
    }
  }

  private createDefaultSessionManager(
    options: InternalDiscoverPageOptions,
  ): FirecrawlSessionManager {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      throw new SessionError('FIRECRAWL_API_KEY is required when no sessionManager is provided');
    }
    const managerOptions = {
      apiKey,
      maxConcurrentSessions: 1,
      warmPoolSize: 0,
      sessionTtlSeconds: 120,
      activityTtlSeconds: 60,
      maxUsesPerSession: 25,
      acquireTimeoutMs: 10000,
      maxQueueSize: 10,
      ...(options.logger ? { logger: options.logger } : { logger: this.logger }),
    };
    return new FirecrawlSessionManager(managerOptions);
  }
}

export async function discoverPage(
  url: string,
  options: Omit<DiscoverPageOptions, 'url'> = {},
): Promise<Result<DiscoveryResult, DiscoveryError>> {
  const discovery = new PageDiscovery(options.logger ? { logger: options.logger } : undefined);
  return discovery.discover({ ...options, url });
}
