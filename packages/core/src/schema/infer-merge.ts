import { TypeDetector, isTableLikeValue } from './type-detector.js';
import type {
  InferredArraySchema,
  InferredObjectSchema,
  InferredPrimitiveSchema,
  InferredSchema,
  InferredTableSchema,
} from './types.js';

export interface InferSchemaOptions {
  enumThreshold?: number;
  maxDepth?: number;
  includeExamples?: boolean;
}

const DEFAULTS: Required<InferSchemaOptions> = {
  enumThreshold: 20,
  maxDepth: 6,
  includeExamples: false,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sampleExamples(values: unknown[], includeExamples: boolean): unknown[] | undefined {
  if (!includeExamples) {
    return undefined;
  }
  return values.slice(0, 3);
}

function compactNullable(values: unknown[]): { nonNull: unknown[]; nullable: boolean } {
  const nonNull: unknown[] = [];
  let nullable = false;
  for (const value of values) {
    if (value === null) {
      nullable = true;
      continue;
    }
    if (value !== undefined) {
      nonNull.push(value);
    }
  }
  return { nonNull, nullable };
}

function finalizeNullable<T extends InferredSchema>(schema: T, nullable: boolean): T {
  if (!nullable) {
    return schema;
  }
  return { ...schema, nullable: true } as T;
}

function inferPrimitive(
  values: unknown[],
  options: Required<InferSchemaOptions>,
): InferredPrimitiveSchema {
  const detector = new TypeDetector();
  const { nonNull, nullable } = compactNullable(values);
  if (nonNull.length === 0) {
    return { kind: 'primitive', type: 'unknown', nullable: true };
  }

  const primitiveTypes = nonNull.map((value) => detector.detectPrimitiveType(value));
  const uniqueTypes = [...new Set(primitiveTypes)];

  let type: InferredPrimitiveSchema['type'] = 'unknown';
  if (uniqueTypes.length === 1) {
    type = uniqueTypes[0] ?? 'unknown';
  } else if (uniqueTypes.every((candidate) => ['string', 'date', 'url'].includes(candidate))) {
    type = 'string';
  }

  const observation = detector.observe(nonNull);
  const schema: InferredPrimitiveSchema = {
    kind: 'primitive',
    type,
  };

  if (
    type === 'string' &&
    observation.uniqueValues.length >= 2 &&
    observation.uniqueValues.length <= options.enumThreshold
  ) {
    schema.enumValues = observation.uniqueValues;
  }

  const examples = sampleExamples(nonNull, options.includeExamples);
  if (examples) {
    schema.examples = examples;
  }

  return finalizeNullable(schema, nullable);
}

function inferObject(
  values: unknown[],
  options: Required<InferSchemaOptions>,
  depth: number,
): InferredObjectSchema {
  const { nonNull, nullable } = compactNullable(values);
  const objects = nonNull.filter((value): value is Record<string, unknown> => isPlainObject(value));
  const keys = [...new Set(objects.flatMap((obj) => Object.keys(obj)))].sort((a, b) =>
    a.localeCompare(b),
  );

  const properties: Record<string, InferredSchema> = {};
  const requiredKeys: string[] = [];

  for (const key of keys) {
    const presentValues: unknown[] = [];
    let presentCount = 0;
    for (const obj of objects) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        presentCount += 1;
        presentValues.push(obj[key]);
      }
    }
    properties[key] = inferSchemaFromSamples(presentValues, options, depth + 1);
    if (presentCount === objects.length && objects.length > 0) {
      requiredKeys.push(key);
    }
  }

  const schema: InferredObjectSchema = {
    kind: 'object',
    properties,
    requiredKeys,
  };

  const examples = sampleExamples(objects, options.includeExamples);
  if (examples) {
    schema.examples = examples;
  }

  return finalizeNullable(schema, nullable);
}

function inferArray(
  values: unknown[],
  options: Required<InferSchemaOptions>,
  depth: number,
): InferredArraySchema {
  const { nonNull, nullable } = compactNullable(values);
  const arrays = nonNull.filter(Array.isArray);
  const allItems = arrays.flat();
  const schema: InferredArraySchema = {
    kind: 'array',
    itemSchema:
      depth >= options.maxDepth
        ? { kind: 'primitive', type: 'unknown' }
        : inferSchemaFromSamples(allItems, options, depth + 1),
  };

  const examples = sampleExamples(arrays, options.includeExamples);
  if (examples) {
    schema.examples = examples;
  }

  return finalizeNullable(schema, nullable);
}

function inferTable(
  values: unknown[],
  options: Required<InferSchemaOptions>,
  depth: number,
): InferredTableSchema {
  const { nonNull, nullable } = compactNullable(values);
  const tables = nonNull.filter(isTableLikeValue);

  const headers = [
    ...new Set(tables.flatMap((table) => (Array.isArray(table.headers) ? table.headers : []))),
  ]
    .filter((value): value is string => typeof value === 'string')
    .sort((a, b) => a.localeCompare(b));

  const rowValues = tables.flatMap((table) => (Array.isArray(table.rows) ? table.rows : []));
  const rowCounts = tables.map((table) =>
    typeof table.rowCount === 'number'
      ? table.rowCount
      : Array.isArray(table.rows)
        ? table.rows.length
        : 0,
  );

  const schema: InferredTableSchema = {
    kind: 'table',
    headers,
    rowSchema:
      depth >= options.maxDepth
        ? { kind: 'primitive', type: 'unknown' }
        : inferSchemaFromSamples(rowValues, options, depth + 1),
  };

  if (rowCounts.length > 0) {
    schema.rowCount = {
      min: Math.min(...rowCounts),
      max: Math.max(...rowCounts),
    };
  }

  const examples = sampleExamples(tables, options.includeExamples);
  if (examples) {
    schema.examples = examples;
  }

  return finalizeNullable(schema, nullable);
}

function kindGroup(
  value: unknown,
  detector: TypeDetector,
): 'primitive' | 'object' | 'array' | 'table' {
  const kind = detector.detectKind(value);
  if (kind === 'object') return 'object';
  if (kind === 'array') return 'array';
  if (kind === 'table') return 'table';
  return 'primitive';
}

export function inferSchemaFromSamples(
  values: unknown[],
  opts: InferSchemaOptions = {},
  depth = 0,
): InferredSchema {
  const options = { ...DEFAULTS, ...opts };
  const detector = new TypeDetector();
  const { nonNull, nullable } = compactNullable(values);

  if (nonNull.length === 0) {
    return { kind: 'primitive', type: 'unknown', nullable: true };
  }

  if (depth >= options.maxDepth) {
    return finalizeNullable({ kind: 'primitive', type: 'unknown' }, nullable);
  }

  const groups = [...new Set(nonNull.map((value) => kindGroup(value, detector)))];
  if (groups.length !== 1) {
    return finalizeNullable(inferPrimitive(values, options), nullable);
  }

  switch (groups[0]) {
    case 'object':
      return inferObject(values, options, depth);
    case 'array':
      return inferArray(values, options, depth);
    case 'table':
      return inferTable(values, options, depth);
    default:
      return inferPrimitive(values, options);
  }
}

export function mergeInferredSchemas(
  a: InferredSchema,
  b: InferredSchema,
  opts: InferSchemaOptions = {},
): InferredSchema {
  const options = { ...DEFAULTS, ...opts };

  if (a.kind !== b.kind) {
    return { kind: 'primitive', type: 'unknown', nullable: Boolean(a.nullable || b.nullable) };
  }

  if (a.kind === 'primitive' && b.kind === 'primitive') {
    const types = new Set([a.type, b.type]);
    let type: InferredPrimitiveSchema['type'] = 'unknown';
    if (types.size === 1) {
      type = a.type;
    } else if ([...types].every((candidate) => ['string', 'date', 'url'].includes(candidate))) {
      type = 'string';
    }

    const enumValues =
      a.enumValues && b.enumValues
        ? [...new Set([...a.enumValues, ...b.enumValues])].slice(0, options.enumThreshold)
        : undefined;

    const merged: InferredPrimitiveSchema = {
      kind: 'primitive',
      type,
      ...(a.nullable || b.nullable ? { nullable: true } : {}),
      ...(enumValues && enumValues.length > 1 ? { enumValues } : {}),
    };
    return merged;
  }

  if (a.kind === 'object' && b.kind === 'object') {
    const keys = [...new Set([...Object.keys(a.properties), ...Object.keys(b.properties)])].sort();
    const properties: Record<string, InferredSchema> = {};
    for (const key of keys) {
      const left = a.properties[key];
      const right = b.properties[key];
      if (left && right) {
        properties[key] = mergeInferredSchemas(left, right, options);
      } else {
        properties[key] = left ?? right ?? { kind: 'primitive', type: 'unknown' };
      }
    }
    const required = a.requiredKeys.filter((key) => b.requiredKeys.includes(key)).sort();
    return {
      kind: 'object',
      properties,
      requiredKeys: required,
      ...(a.nullable || b.nullable ? { nullable: true } : {}),
    };
  }

  if (a.kind === 'array' && b.kind === 'array') {
    return {
      kind: 'array',
      itemSchema: mergeInferredSchemas(a.itemSchema, b.itemSchema, options),
      ...(a.nullable || b.nullable ? { nullable: true } : {}),
    };
  }

  if (a.kind === 'table' && b.kind === 'table') {
    const headers = [...new Set([...a.headers, ...b.headers])].sort();
    const rowCount =
      a.rowCount || b.rowCount
        ? {
            min: Math.min(
              a.rowCount?.min ?? Number.POSITIVE_INFINITY,
              b.rowCount?.min ?? Number.POSITIVE_INFINITY,
            ),
            max: Math.max(a.rowCount?.max ?? 0, b.rowCount?.max ?? 0),
          }
        : undefined;
    const cleanedRowCount =
      rowCount && Number.isFinite(rowCount.min)
        ? rowCount
        : rowCount
          ? { max: rowCount.max }
          : undefined;

    return {
      kind: 'table',
      headers,
      rowSchema: mergeInferredSchemas(a.rowSchema, b.rowSchema, options),
      ...(cleanedRowCount ? { rowCount: cleanedRowCount } : {}),
      ...(a.nullable || b.nullable ? { nullable: true } : {}),
    };
  }

  return { kind: 'primitive', type: 'unknown', nullable: Boolean(a.nullable || b.nullable) };
}
