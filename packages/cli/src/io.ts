import { constants } from 'node:fs';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const absolute = path.resolve(process.cwd(), filePath);
  const content = await readFile(absolute, 'utf8');
  return JSON.parse(content) as T;
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  const absolute = path.resolve(process.cwd(), filePath);
  const content = JSON.stringify(value, null, 2);
  await writeFile(absolute, `${content}\n`, 'utf8');
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(path.resolve(process.cwd(), filePath), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function parseJsonOrFile<T>(input: string): Promise<T> {
  if (await fileExists(input)) {
    return readJsonFile<T>(input);
  }
  return JSON.parse(input) as T;
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printLine(line: string): void {
  process.stdout.write(`${line}\n`);
}
