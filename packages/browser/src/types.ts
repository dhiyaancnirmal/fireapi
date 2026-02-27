import type { Browser, BrowserContext, Page } from 'playwright-core';

export type Result<T, E = Error> = { ok: true; data: T } | { ok: false; error: E };

export type SelectorStrategyType = 'css' | 'xpath' | 'aria' | 'text' | 'position';

export interface SelectorStrategy {
  type: SelectorStrategyType;
  value: string;
  confidence: number;
}

export type DiscoveredElementType =
  | 'text_input'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'date_picker'
  | 'file_upload'
  | 'textarea'
  | 'button'
  | 'submit'
  | 'search';

export interface SelectOption {
  label: string;
  value: string;
}

export interface DiscoveredElement {
  id: string;
  type: DiscoveredElementType;
  tagName: string;
  inputType?: string | null;
  name: string | null;
  label: string | null;
  placeholder: string | null;
  ariaLabel: string | null;
  selectors: SelectorStrategy[];
  options?: SelectOption[];
  required: boolean;
  formId: string | null;
  textContent?: string | null;
  attributes: Record<string, string>;
}

export type TableColumnType = 'string' | 'number' | 'date' | 'boolean' | 'url' | 'unknown';

export interface DiscoveredTable {
  selectors: SelectorStrategy[];
  headers: string[];
  columnTypes: TableColumnType[];
  sampleRows: Record<string, string>[];
  rowCount: number;
  hasPagination: boolean;
}

export interface DiscoveredForm {
  id: string | null;
  name: string | null;
  action: string | null;
  method: string | null;
  selectors: SelectorStrategy[];
  elementIds: string[];
}

export interface PaginationControl {
  kind: 'next' | 'prev' | 'number' | 'load_more' | 'infinite_scroll';
  label: string;
  pageNumber?: number;
  selectors: SelectorStrategy[];
}

export interface FormDependency {
  sourceElement: string;
  targetElement: string;
  type: 'cascading_options' | 'visibility_toggle' | 'value_constraint';
  observedValues: Record<string, string[]>;
}

export interface DiscoveryResult {
  url: string;
  timestamp: string;
  elements: DiscoveredElement[];
  tables: DiscoveredTable[];
  forms: DiscoveredForm[];
  paginationControls: PaginationControl[];
  dependencies: FormDependency[];
}

export interface TableExtractionResult {
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
}

export interface InteractionOptions {
  timeoutMs?: number;
  waitForVisible?: boolean;
  strict?: boolean;
}

export interface BrowserPackageLogger {
  debug?(bindings: unknown, message?: string): void;
  info?(bindings: unknown, message?: string): void;
  warn?(bindings: unknown, message?: string): void;
  error?(bindings: unknown, message?: string): void;
  child?(bindings: Record<string, unknown>): BrowserPackageLogger;
}

export interface FirecrawlSessionRecord {
  id: string;
  cdpUrl: string;
  liveViewUrl?: string;
  createdAt: string;
  lastUsedAt: string;
  useCount: number;
}

export interface BrowserLease {
  session: FirecrawlSessionRecord;
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export interface SessionPoolStats {
  totalSessions: number;
  idleSessions: number;
  leasedSessions: number;
  waitQueueSize: number;
  maxConcurrentSessions: number;
}

export interface FirecrawlSessionManagerOptions {
  apiKey: string;
  maxConcurrentSessions: number;
  warmPoolSize: number;
  sessionTtlSeconds: number;
  activityTtlSeconds: number;
  maxUsesPerSession: number;
  acquireTimeoutMs: number;
  maxQueueSize: number;
  logger?: BrowserPackageLogger;
}

export interface DiscoverPageOptions {
  url: string;
  timeoutMs?: number;
  waitUntil?: 'domcontentloaded' | 'load' | 'networkidle';
  includeTables?: boolean;
  includePagination?: boolean;
  detectDependencies?: boolean;
  maxTableSampleRows?: number;
  sessionManager?: {
    acquire(): Promise<Result<BrowserLease, Error>>;
    release(lease: BrowserLease, outcome?: 'ok' | 'error'): Promise<void>;
  };
  logger?: BrowserPackageLogger;
}

export interface SelectorGenerateInput {
  tagName: string;
  attributes: Record<string, string>;
  labelText?: string | null;
  textContent?: string | null;
  formContext?: { id?: string | null };
  domPath?: number[];
}

export interface RawDomSnapshotElement {
  tagName: string;
  inputType: string | null;
  name: string | null;
  id: string | null;
  className: string | null;
  label: string | null;
  placeholder: string | null;
  ariaLabel: string | null;
  required: boolean;
  formId: string | null;
  formName: string | null;
  textContent: string | null;
  options?: SelectOption[];
  attributes: Record<string, string>;
  domPath: number[];
}

export interface RawDomSnapshotTable {
  id: string | null;
  className: string | null;
  headers: string[];
  rows: string[][];
  rowCount: number;
  domPath: number[];
}

export interface RawDomSnapshotForm {
  id: string | null;
  name: string | null;
  action: string | null;
  method: string | null;
  domPath: number[];
}

export interface RawDomSnapshotPaginationControl {
  kindHint: 'next' | 'prev' | 'number' | 'load_more' | 'unknown';
  label: string;
  pageNumber?: number;
  tagName: string;
  id: string | null;
  className: string | null;
  ariaLabel: string | null;
  domPath: number[];
  attributes: Record<string, string>;
}

export interface RawDomSnapshot {
  url: string;
  timestamp: string;
  elements: RawDomSnapshotElement[];
  tables: RawDomSnapshotTable[];
  forms: RawDomSnapshotForm[];
  paginationControls: RawDomSnapshotPaginationControl[];
}

export interface FirecrawlBrowserSessionResponse {
  id: string;
  cdpUrl: string;
  liveViewUrl?: string;
}
