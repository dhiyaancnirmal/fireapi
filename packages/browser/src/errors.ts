export class FireAPIError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'FireAPIError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class SessionError extends FireAPIError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'SESSION_ERROR', 503, details);
    this.name = 'SessionError';
  }
}

export class DiscoveryError extends FireAPIError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'DISCOVERY_FAILED', 500, details);
    this.name = 'DiscoveryError';
  }
}

export class SelectorError extends FireAPIError {
  readonly selectorsTried: string[];

  constructor(message: string, selectorsTried: string[]) {
    super(message, 'SELECTOR_NOT_FOUND', 502, { selectorsTried });
    this.name = 'SelectorError';
    this.selectorsTried = selectorsTried;
  }
}
