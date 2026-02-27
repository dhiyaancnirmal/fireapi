# @fireapi/cli

CLI wrapper for `@fireapi/server` APIs.

## Build

```bash
pnpm --filter @fireapi/cli build
```

## Commands

- `fireapi server start --host --port --db --firecrawl-key --runner-concurrency`
- `fireapi dashboard open [--server-url] [--open]`
- `fireapi discover --url <url> [--out <file>]`
- `fireapi workflow generate --discovery <file> [--out <file>]`
- `fireapi workflow validate --workflow <file>`
- `fireapi workflow register --workflow <file> [--name <name>]`
- `fireapi run create (--workflow <file> | --workflow-id <id>) --input <json-or-file> [--wait]`
- `fireapi run status --run-id <id>`
- `fireapi run wait --run-id <id> [--interval-ms <n>] [--timeout-ms <n>]`
- `fireapi recorder start --url <url> [--name <name>]`
- `fireapi recorder finalize --session-id <id> [--register] [--name <name>] [--out <file>]`

Use `--json` for machine-readable output.
