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

export class WorkflowValidationError extends FireAPIError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'WORKFLOW_VALIDATION_FAILED', 400, details);
    this.name = 'WorkflowValidationError';
  }
}

export class WorkflowExecutionError extends FireAPIError {
  readonly failedStepId: string | undefined;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'WORKFLOW_EXECUTION_FAILED', 502, details);
    this.name = 'WorkflowExecutionError';
    this.failedStepId =
      typeof details?.failedStepId === 'string' ? details.failedStepId : undefined;
  }
}

export class ConditionError extends FireAPIError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONDITION_ERROR', 400, details);
    this.name = 'ConditionError';
  }
}

export class ConditionParseError extends ConditionError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
    this.name = 'ConditionParseError';
  }
}

export class SchemaInferenceError extends FireAPIError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'SCHEMA_INFERENCE_FAILED', 500, details);
    this.name = 'SchemaInferenceError';
  }
}
