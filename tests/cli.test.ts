import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

describe('CLI Shell Interface', () => {
  it('should compile and support CLI options', () => {
    // Fails initially because cli.ts and build targets don't exist
    execSync('npm run build');
    const stdout = execSync('node ./dist/cli.js --help').toString();
    expect(stdout).toContain('scctl');
  });

  it('should support check command', () => {
    const stdout = execSync('node ./dist/cli.js check').toString();
    expect(stdout).toMatch(/STATUS: (OK|ERROR)/);
  });

  it('should support run command', () => {
    const tempFile = path.resolve('temp_test_cli.scd');
    fs.writeFileSync(tempFile, '1 + 1');
    try {
      const checkStdout = execSync('node ./dist/cli.js check').toString();
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
