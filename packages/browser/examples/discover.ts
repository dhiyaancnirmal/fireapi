import { discoverPage } from '../src/index.js';

async function main(): Promise<void> {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: tsx packages/browser/examples/discover.ts <url>');
    process.exitCode = 1;
    return;
  }

  const result = await discoverPage(url);
  if (!result.ok) {
    console.error(
      JSON.stringify(
        { error: result.error.code, message: result.error.message, details: result.error.details },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify(result.data, null, 2));
}

void main();
