#!/usr/bin/env node
import { Command } from 'commander';
import { ScDriver } from './runtime/driver.js';
import { DriverResult } from './runtime/driver-types.js';
import { readScdFile } from './runtime/sc-file.js';

const driver = new ScDriver();
const program = new Command();

program
  .name('scctl')
  .description('Structured SuperCollider driver CLI for local agents and operators')
  .version('1.0.0');

function printResult(result: DriverResult<unknown>): never {
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

program
  .command('check')
  .description('Verify that SuperCollider is discoverable and the interpreter can be reached')
  .action(async () => {
    printResult(await driver.check());
  });

program
  .command('status')
  .description('Show the current driver session snapshot')
  .action(async () => {
    printResult(await driver.status());
  });

program
  .command('health')
  .description('Run a deeper health probe against the active session')
  .action(async () => {
    printResult(await driver.health());
  });

program
  .command('eval <code>')
  .description('Evaluate inline SuperCollider code in the driver session')
  .action(async (code: string) => {
    printResult(await driver.eval(code));
  });

program
  .command('run <file>')
  .description('Read and evaluate a .scd file in the driver session')
  .action(async (file: string) => {
    printResult(await driver.runFile(file, readScdFile));
  });

program
  .command('logs')
  .description('Return the current driver log buffer')
  .option('--tail <n>', 'Return only the last N characters', parsePositiveInt)
  .action(async (options: { tail?: number }) => {
    printResult(await driver.logs(options.tail));
  });

program
  .command('render <file>')
  .description('Render a .scd file to a draft WAV using the realtime render flow')
  .requiredOption('-o, --out <path>', 'Output WAV path')
  .option('-d, --duration <seconds>', 'Draft render duration in seconds', '5')
  .action(async (file: string, options: { duration: string; out: string }) => {
    const durationSec = parseFloat(options.duration);
    let userCode = '';

    try {
      userCode = readScdFile(file);
    } catch (err: any) {
      printResult(
        await driver.render({
          durationSec,
          outPath: options.out,
          userCode,
        }),
      );
    }

    printResult(
      await driver.render({
        durationSec,
        outPath: options.out,
        userCode,
      }),
    );
  });

program
  .command('stop')
  .description('Stop the active driver session')
  .action(async () => {
    printResult(await driver.stop());
  });

program
  .command('reset')
  .description('Reset the active driver session without discarding it when possible')
  .action(async () => {
    printResult(await driver.reset());
  });

program
  .command('reboot')
  .description('Stop the active session and start a fresh ready session')
  .action(async () => {
    printResult(await driver.reboot());
  });

program
  .command('reclaim')
  .description('Discard the local session handle and create a fresh ready session')
  .action(async () => {
    printResult(await driver.reclaim());
  });

function parsePositiveInt(value: string): number {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('Value must be a positive integer');
  }
  return n;
}

await program.parseAsync(process.argv);
