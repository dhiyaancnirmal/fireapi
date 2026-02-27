import { type ZodTypeAny, z } from 'zod';

import type { GeneratedZodSchemas, InferredSchema } from './types.js';

function applyNullable(schema: ZodTypeAny, nullable?: boolean): ZodTypeAny {
  return nullable ? schema.nullable() : schema;
}

function toJsonSchema(schema: InferredSchema): Record<string, unknown> {
  switch (schema.kind) {
    case 'primitive': {
      let type: string | string[] = 'string';
      let format: string | undefined;
      switch (schema.type) {
        case 'number':
          type = 'number';
          break;
        case 'boolean':
          type = 'boolean';
          break;
        case 'date':
          type = 'string';
          format = 'date-time';
          break;
        case 'url':
          type = 'string';
          format = 'uri';
          break;
        case 'unknown':
          type = ['string', 'number', 'boolean', 'object', 'array', 'null'];
          break;
        default:
          type = 'string';
          break;
      }
      const out: Record<string, unknown> = { type };
      if (schema.enumValues && schema.enumValues.length > 0) {
        out.enum = schema.enumValues;
      }
      if (format) {
        out.format = format;
      }
      return schema.nullable && schema.type !== 'unknown'
        ? { anyOf: [out, { type: 'null' }] }
        : out;
    }
    case 'object': {
      const properties: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(schema.properties)) {
        properties[key] = toJsonSchema(value);
      }
      const out: Record<string, unknown> = {
        type: 'object',
        properties,
        additionalProperties: false,
      };
      if (schema.requiredKeys.length > 0) {
        out.required = schema.requiredKeys;
      }
      return schema.nullable ? { anyOf: [out, { type: 'null' }] } : out;
    }
    case 'array': {
      const out: Record<string, unknown> = {
        type: 'array',
        items: toJsonSchema(schema.itemSchema),
      };
      return schema.nullable ? { anyOf: [out, { type: 'null' }] } : out;
    }
    case 'table': {
      const out: Record<string, unknown> = {
        type: 'object',
        properties: {
          headers: { type: 'array', items: { type: 'string' } },
          rows: { type: 'array', items: toJsonSchema(schema.rowSchema) },
          rowCount: {
            type: 'number',
            ...(schema.rowCount?.min !== undefined ? { minimum: schema.rowCount.min } : {}),
            ...(schema.rowCount?.max !== undefined ? { maximum: schema.rowCount.max } : {}),
          },
        },
        required: ['headers', 'rows', 'rowCount'],
        additionalProperties: false,
      };
      return schema.nullable ? { anyOf: [out, { type: 'null' }] } : out;
    }
    default:
      return {};
  }
}

function buildEnumSchema(values: Array<string | number | boolean>): ZodTypeAny | null {
  if (values.length === 0) {
    return null;
  }
  const allStrings = values.every((value) => typeof value === 'string');
  if (allStrings) {
    const unique = [...new Set(values as string[])];
    if (unique.length > 0) {
      return z.enum(unique as [string, ...string[]]);
    }
  }
  const literals = values.map((value) => z.literal(value));
  if (literals.length === 1) {
    const single = literals[0];
    return single ?? null;
  }
  if (literals.length < 2) {
    return null;
  }
  return z.union(literals as unknown as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]);
}

export class ZodBuilder {
  buildSchema(schema: InferredSchema): ZodTypeAny {
    switch (schema.kind) {
      case 'primitive': {
        if (schema.enumValues && schema.enumValues.length > 0) {
          const enumSchema = buildEnumSchema(schema.enumValues);
          if (enumSchema) {
            return applyNullable(enumSchema, schema.nullable);
          }
        }
        switch (schema.type) {
          case 'number':
            return applyNullable(z.number(), schema.nullable);
          case 'boolean':
            return applyNullable(z.boolean(), schema.nullable);
          case 'date':
            return applyNullable(z.string().describe('date-time'), schema.nullable);
          case 'url':
            return applyNullable(z.string().url(), schema.nullable);
          case 'unknown':
            return applyNullable(z.unknown(), schema.nullable);
          default:
            return applyNullable(z.string(), schema.nullable);
        }
      }
      case 'object': {
        const required = new Set(schema.requiredKeys);
        const shape: Record<string, ZodTypeAny> = {};
        for (const [key, value] of Object.entries(schema.properties)) {
          const propSchema = this.buildSchema(value);
          shape[key] = required.has(key) ? propSchema : propSchema.optional();
        }
        return applyNullable(z.object(shape), schema.nullable);
      }
      case 'array':
        return applyNullable(z.array(this.buildSchema(schema.itemSchema)), schema.nullable);
      case 'table': {
        const tableSchema = z.object({
          headers: z.array(z.string()),
          rows: z.array(this.buildSchema(schema.rowSchema)),
          rowCount: z.number(),
        });
        return applyNullable(tableSchema, schema.nullable);
      }
      default:
        return z.unknown();
    }
  }

  buildJsonSchema(schema: InferredSchema): Record<string, unknown> {
    return toJsonSchema(schema);
  }

  buildGenerated(inputSchema: InferredSchema, outputSchema: InferredSchema): GeneratedZodSchemas {
    return {
      input: this.buildSchema(inputSchema),
      output: this.buildSchema(outputSchema),
      inputJsonSchema: this.buildJsonSchema(inputSchema),
      outputJsonSchema: this.buildJsonSchema(outputSchema),
    };
  }
}
