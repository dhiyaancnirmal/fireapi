import { WorkflowGraphValidator } from '@fireapi/core';

import { RecorderError } from './errors.js';
import { type RecorderPackageLogger, createRecorderLogger } from './logger.js';
import type {
  FinalizeRecordingResult,
  RecorderActionInput,
  RecorderActionRecord,
  RecorderResult,
  RecorderSessionRecord,
} from './types.js';
import { WorkflowDraftBuilder } from './workflow-draft-builder.js';

export interface RecorderServiceOptions {
  draftBuilder?: WorkflowDraftBuilder;
  validator?: WorkflowGraphValidator;
  logger?: RecorderPackageLogger;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeError(error: unknown): Record<string, unknown> {
  if (error && typeof error === 'object' && !Array.isArray(error)) {
    return error as Record<string, unknown>;
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: String(error) };
}

export class RecorderService {
  private readonly draftBuilder: WorkflowDraftBuilder;
  private readonly validator: WorkflowGraphValidator;
  private readonly logger: RecorderPackageLogger;

  constructor(options: RecorderServiceOptions = {}) {
    this.draftBuilder = options.draftBuilder ?? new WorkflowDraftBuilder();
    this.validator = options.validator ?? new WorkflowGraphValidator();
    this.logger = options.logger ?? createRecorderLogger({ base: { module: 'recorder-service' } });
  }

  createActionRecord(input: {
    id: number;
    sessionId: string;
    seq: number;
    action: RecorderActionInput;
    output?: Record<string, unknown> | null;
    error?: unknown;
    createdAt?: string;
  }): RecorderActionRecord {
    return {
      id: input.id,
      sessionId: input.sessionId,
      seq: input.seq,
      type: input.action.type,
      input: input.action,
      output: input.output ?? null,
      error: input.error === undefined ? null : normalizeError(input.error),
      createdAt: input.createdAt ?? nowIso(),
    };
  }

  finalize(input: {
    session: RecorderSessionRecord;
    actions: RecorderActionRecord[];
    workflowName?: string;
    workflowId?: string;
  }): RecorderResult<FinalizeRecordingResult, RecorderError> {
    if (input.session.status === 'failed') {
      return {
        ok: false,
        error: new RecorderError(
          'Cannot finalize a failed recording session',
          'SESSION_FAILED',
          409,
        ),
      };
    }

    try {
      const draft = this.draftBuilder.buildFromActions({
        session: {
          id: input.session.id,
          name: input.session.name,
          startUrl: input.session.startUrl,
        },
        actions: input.actions,
        ...(input.workflowName ? { workflowName: input.workflowName } : {}),
        ...(input.workflowId ? { workflowId: input.workflowId } : {}),
      });

      const validation = this.validator.validate(draft.workflow);
      if (!validation.ok) {
        return {
          ok: false,
          error: new RecorderError(
            'Generated workflow could not be validated',
            'WORKFLOW_INVALID',
            500,
            {
              cause: validation.error.message,
            },
          ),
        };
      }

      const result: FinalizeRecordingResult = {
        workflow: draft.workflow,
        issues: validation.data.issues,
        warnings: draft.warnings,
      };

      this.logger.info?.(
        {
          sessionId: input.session.id,
          stepCount: draft.workflow.steps.length,
          issueCount: result.issues.length,
          warningCount: result.warnings.length,
        },
        'Finalized recording session',
      );

      return { ok: true, data: result };
    } catch (error) {
      return {
        ok: false,
        error: new RecorderError('Failed to finalize recording', 'FINALIZE_FAILED', 500, {
          cause: error instanceof Error ? error.message : String(error),
        }),
      };
    }
  }
}
