#!/usr/bin/env node
import { Command } from 'commander';
import { discoverSclangPath } from './runtime/discover.js';
import { SclangController } from './runtime/sclang.js';
import fs from 'fs';

const program = new Command();

program
  .name('scctl')
  .description('SuperCollider Coding Agent Control CLI')
  .version('1.0.0');

program
  .command('check')
  .description('Check SuperCollider installation path')
  .action(() => {
    const sclangPath = discoverSclangPath();
    if (sclangPath) {
      console.log('STATUS: OK');
      console.log(`Path: ${sclangPath}`);
    } else {
      console.log('STATUS: ERROR');
      console.error('Error: sclang binary not found');
      process.exit(1);
    }
  });

program
  .command('run <file>')
  .description('Run a .scd file and evaluate it using SclangController')
  .action(async (file) => {
    try {
      if (!fs.existsSync(file)) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
      }
      const code = fs.readFileSync(file, 'utf-8');
      const sclangPath = discoverSclangPath();
      if (!sclangPath) {
        console.error('Error: sclang binary not found');
        process.exit(1);
      }
      const controller = new SclangController(sclangPath);
      await controller.boot();
      const result = await controller.execute(code);
      if (result.success) {
        console.log(result.output);
        controller.stop();
        process.exit(0);
      } else {
        console.error(result.output);
        controller.stop();
        process.exit(1);
      }
    } catch (err: any) {
      console.error(`Execution failed: ${err.message}`);
      process.exit(1);
    }
  });

await program.parseAsync(process.argv);
