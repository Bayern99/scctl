import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

describe('CLI Shell Interface', () => {
  beforeAll(() => {
    execSync('npm run build');
  }, 15000);

  it('should compile and support CLI options', () => {
    const stdout = execSync('node ./dist/cli.js --help').toString();
    expect(stdout).toContain('scctl');
  });

  it('should support check command', () => {
    let stdout = '';
    try {
      stdout = execSync('node ./dist/cli.js check').toString();
    } catch (err: any) {
      stdout = err.stdout ? err.stdout.toString() : '';
    }
    expect(stdout).toMatch(/STATUS: (OK|ERROR)/);
  });

  it('should support run command', () => {
    const tempFile = path.resolve('temp_test_cli.scd');
    fs.writeFileSync(tempFile, '1 + 1');
    try {
      let checkStdout = '';
      try {
        checkStdout = execSync('node ./dist/cli.js check').toString();
      } catch (err: any) {
        checkStdout = err.stdout ? err.stdout.toString() : '';
      }

      if (checkStdout.includes('STATUS: OK')) {
        const stdout = execSync(`node ./dist/cli.js run "${tempFile}"`).toString();
        expect(stdout).toBeDefined();
      } else {
        expect(() => {
          execSync(`node ./dist/cli.js run "${tempFile}"`);
        }).toThrow();
      }
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });
});
