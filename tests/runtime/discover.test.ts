import { describe, it, expect, vi } from 'vitest';
import { discoverSclangPath } from '../../src/runtime/discover.js';

vi.mock('fs', () => ({
  default: {
    existsSync: (p: string) => p.includes('SuperCollider') || p.includes('sclang'),
  }
}));

describe('Runtime Discovery', () => {
  it('should find sclang path on macOS', () => {
    const path = discoverSclangPath('darwin');
    expect(path).toBe('/Applications/SuperCollider.app/Contents/MacOS/sclang');
  });

  it('should find sclang path on Windows', () => {
    const path = discoverSclangPath('win32');
    expect(path).toBe('C:\\Program Files\\SuperCollider\\sclang.exe');
  });
});
