export class RecorderError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    message: string,
    code = 'RECORDER_ERROR',
    statusCode = 500,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'RecorderError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
