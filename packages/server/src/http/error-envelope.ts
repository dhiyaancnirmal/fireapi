import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { NotFoundError, ServerError, ValidationError } from '../errors.js';
import type { ErrorEnvelope } from '../types.js';

export function toErrorEnvelope(
  error: unknown,
  requestId: string,
): { statusCode: number; body: ErrorEnvelope } {
  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: { issues: error.issues },
          requestId,
        },
      },
    };
  }

  if (error instanceof ServerError) {
    const body: ErrorEnvelope = {
      error: {
        code: error.code,
        message: error.message,
        requestId,
      },
    };
    if (error.details) {
      body.error.details = error.details;
    }
    return {
      statusCode: error.statusCode,
      body,
    };
  }

  if (error instanceof Error && error.name === 'NotFoundError') {
    const wrapped = new NotFoundError(error.message);
    return toErrorEnvelope(wrapped, requestId);
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    statusCode: 500,
    body: {
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message,
        requestId,
      },
    },
  };
}

export function sendError(reply: FastifyReply, request: FastifyRequest, error: unknown): void {
  const envelope = toErrorEnvelope(error, request.id);
  void reply.status(envelope.statusCode).send(envelope.body);
}

export function ensureFound<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new NotFoundError(message);
  }
  return value;
}

export function ensureValid<T>(
  value: T,
  predicate: (input: T) => boolean,
  message: string,
  details?: Record<string, unknown>,
): T {
  if (!predicate(value)) {
    throw new ValidationError(message, details);
  }
  return value;
}
