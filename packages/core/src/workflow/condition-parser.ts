import type { Result } from '@fireapi/browser';

import { ConditionParseError } from '../errors.js';

export type ConditionAstNode =
  | { kind: 'literal'; value: unknown }
  | { kind: 'reference'; path: string }
  | { kind: 'unary'; operator: 'exists'; right: ConditionAstNode }
  | {
      kind: 'binary';
      operator: '||' | '&&' | '==' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'in';
      left: ConditionAstNode;
      right: ConditionAstNode;
    };

type TokenType =
  | 'lparen'
  | 'rparen'
  | 'number'
  | 'string'
  | 'boolean'
  | 'null'
  | 'identifier'
  | 'dot'
  | 'operator';

interface Token {
  type: TokenType;
  value: string;
}

const OPERATOR_VALUES = ['>=', '<=', '==', '!=', '&&', '||', '>', '<'] as const;
const WORD_OPERATORS = new Set(['contains', 'in', 'exists']);

function tokenize(input: string): Result<Token[], ConditionParseError> {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];
    if (char === undefined) {
      break;
    }
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '(') {
      tokens.push({ type: 'lparen', value: char });
      index += 1;
      continue;
    }
    if (char === ')') {
      tokens.push({ type: 'rparen', value: char });
      index += 1;
      continue;
    }
    if (char === '.') {
      tokens.push({ type: 'dot', value: char });
      index += 1;
      continue;
    }

    const op = OPERATOR_VALUES.find((candidate) => input.startsWith(candidate, index));
    if (op) {
      tokens.push({ type: 'operator', value: op });
      index += op.length;
      continue;
    }

    if (char === '"' || char === "'") {
      const quote = char;
      let value = '';
      index += 1;
      while (index < input.length) {
        const next = input[index];
        if (next === '\\') {
          value += input[index + 1] ?? '';
          index += 2;
          continue;
        }
        if (next === quote) {
          index += 1;
          break;
        }
        value += next;
        index += 1;
      }
      tokens.push({ type: 'string', value });
      continue;
    }

    if (/[-0-9]/.test(char)) {
      const match = input.slice(index).match(/^-?\d+(?:\.\d+)?/);
      if (!match) {
        return { ok: false, error: new ConditionParseError('Invalid numeric token', { index }) };
      }
      tokens.push({ type: 'number', value: match[0] });
      index += match[0].length;
      continue;
    }

    if (/[a-zA-Z_]/.test(char)) {
      const match = input.slice(index).match(/^[a-zA-Z_][a-zA-Z0-9_-]*/);
      if (!match) {
        return { ok: false, error: new ConditionParseError('Invalid identifier token', { index }) };
      }
      const value = match[0];
      if (value === 'true' || value === 'false') {
        tokens.push({ type: 'boolean', value });
      } else if (value === 'null') {
        tokens.push({ type: 'null', value });
      } else if (WORD_OPERATORS.has(value)) {
        tokens.push({ type: 'operator', value });
      } else {
        tokens.push({ type: 'identifier', value });
      }
      index += value.length;
      continue;
    }

    return { ok: false, error: new ConditionParseError('Unexpected token', { index, char }) };
  }

  return { ok: true, data: tokens };
}

export class ConditionParser {
  parse(expression: string): Result<ConditionAstNode, ConditionParseError> {
    const tokenized = tokenize(expression);
    if (!tokenized.ok) {
      return tokenized;
    }
    const tokens = tokenized.data;
    let index = 0;

    const peek = (): Token | undefined => tokens[index];
    const consume = (): Token | undefined => {
      const token = tokens[index];
      index += 1;
      return token;
    };
    const expect = (type: TokenType, value?: string): Result<Token, ConditionParseError> => {
      const token = consume();
      if (!token || token.type !== type || (value !== undefined && token.value !== value)) {
        return {
          ok: false,
          error: new ConditionParseError('Unexpected token while parsing condition', {
            expectedType: type,
            expectedValue: value,
            actual: token,
          }),
        };
      }
      return { ok: true, data: token };
    };

    const parsePrimary = (): Result<ConditionAstNode, ConditionParseError> => {
      const token = peek();
      if (!token) {
        return { ok: false, error: new ConditionParseError('Unexpected end of condition') };
      }
      if (token.type === 'lparen') {
        consume();
        const inner = parseOr();
        if (!inner.ok) {
          return inner;
        }
        const close = expect('rparen');
        if (!close.ok) {
          return close;
        }
        return inner;
      }
      if (token.type === 'string') {
        consume();
        return { ok: true, data: { kind: 'literal', value: token.value } };
      }
      if (token.type === 'number') {
        consume();
        return { ok: true, data: { kind: 'literal', value: Number(token.value) } };
      }
      if (token.type === 'boolean') {
        consume();
        return { ok: true, data: { kind: 'literal', value: token.value === 'true' } };
      }
      if (token.type === 'null') {
        consume();
        return { ok: true, data: { kind: 'literal', value: null } };
      }
      if (token.type === 'identifier') {
        const parts = [token.value];
        consume();
        while (peek()?.type === 'dot') {
          consume();
          const nextId = expect('identifier');
          if (!nextId.ok) {
            return nextId;
          }
          parts.push(nextId.data.value);
        }
        return { ok: true, data: { kind: 'reference', path: parts.join('.') } };
      }
      return {
        ok: false,
        error: new ConditionParseError('Unexpected token in primary expression', { token }),
      };
    };

    const parseUnary = (): Result<ConditionAstNode, ConditionParseError> => {
      const token = peek();
      if (token?.type === 'operator' && token.value === 'exists') {
        consume();
        const right = parseUnary();
        if (!right.ok) {
          return right;
        }
        return { ok: true, data: { kind: 'unary', operator: 'exists', right: right.data } };
      }
      return parsePrimary();
    };

    const parseComparison = (): Result<ConditionAstNode, ConditionParseError> => {
      let left = parseUnary();
      if (!left.ok) {
        return left;
      }

      while (true) {
        const token = peek();
        if (
          token?.type === 'operator' &&
          ['==', '!=', '>', '>=', '<', '<=', 'contains', 'in'].includes(token.value)
        ) {
          consume();
          const right = parseUnary();
          if (!right.ok) {
            return right;
          }
          left = {
            ok: true,
            data: {
              kind: 'binary',
              operator: token.value as '==' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'in',
              left: left.data,
              right: right.data,
            },
          };
          continue;
        }
        break;
      }

      return left;
    };

    const parseAnd = (): Result<ConditionAstNode, ConditionParseError> => {
      let left = parseComparison();
      if (!left.ok) {
        return left;
      }

      while (peek()?.type === 'operator' && peek()?.value === '&&') {
        consume();
        const right = parseComparison();
        if (!right.ok) {
          return right;
        }
        left = {
          ok: true,
          data: { kind: 'binary', operator: '&&', left: left.data, right: right.data },
        };
      }
      return left;
    };

    const parseOr = (): Result<ConditionAstNode, ConditionParseError> => {
      let left = parseAnd();
      if (!left.ok) {
        return left;
      }

      while (peek()?.type === 'operator' && peek()?.value === '||') {
        consume();
        const right = parseAnd();
        if (!right.ok) {
          return right;
        }
        left = {
          ok: true,
          data: { kind: 'binary', operator: '||', left: left.data, right: right.data },
        };
      }
      return left;
    };

    const parsed = parseOr();
    if (!parsed.ok) {
      return parsed;
    }

    if (index < tokens.length) {
      return {
        ok: false,
        error: new ConditionParseError('Unexpected trailing tokens', {
          trailing: tokens.slice(index),
        }),
      };
    }

    return parsed;
  }
}
