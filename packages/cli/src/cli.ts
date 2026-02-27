import { Command, CommanderError } from 'commander';

import { registerDashboardOpenCommand } from './commands/dashboard-open.js';
import { registerDiscoverCommand } from './commands/discover.js';
import { registerRecorderFinalizeCommand } from './commands/recorder-finalize.js';
import { registerRecorderStartCommand } from './commands/recorder-start.js';
import { registerRunCreateCommand } from './commands/run-create.js';
import { registerRunStatusCommand } from './commands/run-status.js';
import { registerRunWaitCommand } from './commands/run-wait.js';
import { registerServerStartCommand } from './commands/server-start.js';
import { registerWorkflowGenerateCommand } from './commands/workflow-generate.js';
import { registerWorkflowRegisterCommand } from './commands/workflow-register.js';
import { registerWorkflowValidateCommand } from './commands/workflow-validate.js';

function stderr(line: string): void {
  process.stderr.write(`${line}\n`);
}

export function buildCLI(): Command {
  const program = new Command();
  program
    .name('fireapi')
    .description('FireAPI CLI')
    .option(
      '--server-url <url>',
      'FireAPI server URL',
      process.env.FIREAPI_SERVER_URL ?? 'http://127.0.0.1:3001',
    )
    .option('--json', 'Machine-readable JSON output', false)
    .showHelpAfterError();

  registerServerStartCommand(program);
  registerDashboardOpenCommand(program);
  registerDiscoverCommand(program);
  registerRecorderStartCommand(program);
  registerRecorderFinalizeCommand(program);

  const workflowCommand = program.command('workflow').description('Workflow operations');
  registerWorkflowGenerateCommand(workflowCommand);
  registerWorkflowValidateCommand(workflowCommand);
  registerWorkflowRegisterCommand(workflowCommand);

  const runCommand = program.command('run').description('Run operations');
  registerRunCreateCommand(runCommand);
  registerRunStatusCommand(runCommand);
  registerRunWaitCommand(runCommand);

  return program;
}

export async function runCLI(argv: string[] = process.argv.slice(2)): Promise<number> {
  const program = buildCLI();
  program.exitOverride();

  try {
    await program.parseAsync(argv, { from: 'user' });
    const exitCode = process.exitCode;
    return typeof exitCode === 'number' ? exitCode : 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code !== 'commander.helpDisplayed') {
        stderr(error.message);
      }
      const exitCode = typeof error.exitCode === 'number' ? error.exitCode : 2;
      return error.code.startsWith('commander.') ? 2 : exitCode;
    }

    if (error instanceof Error) {
      stderr(error.message);
    } else {
      stderr(String(error));
    }
    return 1;
  }
}
