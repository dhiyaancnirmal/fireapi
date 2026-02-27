import type { Result } from '@fireapi/browser';

import { ConditionError } from '../errors.js';
import { getPathRefValue } from '../utils/path-ref.js';
import { stableJsonStringify } from '../utils/stable-json.js';
import { type ConditionAstNode, ConditionParser } from './condition-parser.js';
import type { ConditionEvaluationContext } from './types.js';

function deepEqual(a: unknown, b: unknown): boolean {
  return stableJsonStringify(a) === stableJsonStringify(b);
}

function truthy(value: unknown): boolean {
  return Boolean(value);
}

function compareValues(op: string, left: unknown, right: unknown): boolean {
  switch (op) {
    case '==':
      return deepEqual(left, right);
    case '!=':
      return !deepEqual(left, right);
    case '>':
      return Number(left) > Number(right);
    case '>=':
      return Number(left) >= Number(right);
    case '<':
      return Number(left) < Number(right);
    case '<=':
      return Number(left) <= Number(right);
    case 'contains': {
      if (typeof left === 'string') {
        return left.includes(String(right));
      }
      if (Array.isArray(left)) {
        return left.some((item) => deepEqual(item, right));
      }
      return false;
    }
    case 'in': {
      if (Array.isArray(right)) {
        return right.some((item) => deepEqual(item, left));
      }
      if (typeof right === 'string') {
        return right.includes(String(left));
      }
      if (right && typeof right === 'object') {
        return String(left) in (right as Record<string, unknown>);
      }
      return false;
    }
    default:
      return false;
  }
}

function evaluateAstNode(node: ConditionAstNode, context: ConditionEvaluationContext): unknown {
  switch (node.kind) {
    case 'literal':
      return node.value;
    case 'reference':
      return getPathRefValue(context, node.path);
    case 'unary': {
      if (node.operator === 'exists') {
        const value = evaluateAstNode(node.right, context);
        return value !== undefined && value !== null;
      }
      return false;
    }
    case 'binary': {
      if (node.operator === '&&') {
        return (
          truthy(evaluateAstNode(node.left, context)) &&
          truthy(evaluateAstNode(node.right, context))
        );
      }
      if (node.operator === '||') {
        return (
          truthy(evaluateAstNode(node.left, context)) ||
          truthy(evaluateAstNode(node.right, context))
        );
      }
      const left = evaluateAstNode(node.left, context);
      const right = evaluateAstNode(node.right, context);
      return compareValues(node.operator, left, right);
    }
    default:
      return false;
  }
}

export class ConditionEvaluator {
  private readonly parser: ConditionParser;

  constructor(parser?: ConditionParser) {
    this.parser = parser ?? new ConditionParser();
  }

  evaluate(
    conditionOrAst: string | ConditionAstNode,
    context: ConditionEvaluationContext,
  ): Result<boolean, ConditionError> {
    try {
      const ast =
        typeof conditionOrAst === 'string'
          ? this.parser.parse(conditionOrAst)
          : ({ ok: true, data: conditionOrAst } as const);
      if (!ast.ok) {
        return { ok: false, error: ast.error };
      }
      const value = evaluateAstNode(ast.data, context);
      return { ok: true, data: truthy(value) };
    } catch (error) {
      return {
        ok: false,
        error: new ConditionError('Failed to evaluate condition', {
          cause: error instanceof Error ? error.message : String(error),
          condition:
            typeof conditionOrAst === 'string'
              ? conditionOrAst
              : stableJsonStringify(conditionOrAst),
        }),
      };
    }
  }
}
