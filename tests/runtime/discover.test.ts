import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { discoverSclangPath } from '../../src/runtime/discover.js';

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
  }
}));

describe('Runtime Discovery', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReset();
  });

  it('should find sclang path on macOS', () => {
    vi.mocked(fs.existsSync).mockImplementation((p: any) => p.includes('SuperCollider'));
    const path = discoverSclangPath('darwin');
    expect(path).toBe('/Applications/SuperCollider.app/Contents/MacOS/sclang');
  });

  it('should find sclang path on Windows', () => {
    vi.mocked(fs.existsSync).mockImplementation((p: any) => p.includes('SuperCollider'));
    const path = discoverSclangPath('win32');
    expect(path).toBe('C:\\Program Files\\SuperCollider\\sclang.exe');
  });

  it('should find sclang path on Linux', () => {
    vi.mocked(fs.existsSync).mockImplementation((p: any) => p === '/usr/bin/sclang');
    const path = discoverSclangPath('linux');
    expect(path).toBe('/usr/bin/sclang');
  });

  it('should find sclang path in PATH environment variable on macOS/Linux', () => {
    const originalEnv = process.env.PATH;
    process.env.PATH = '/custom/bin:/another/bin';
    try {
      vi.mocked(fs.existsSync).mockImplementation((p: any) => p === '/another/bin/sclang');
      const path = discoverSclangPath('darwin');
      expect(path).toBe('/another/bin/sclang');
    } finally {
      process.env.PATH = originalEnv;
    }
  });

  it('should find sclang path in PATH environment variable on Windows', () => {
    const originalEnv = process.env.PATH;
    process.env.PATH = 'C:\\custom\\bin;C:\\another\\bin';
    try {
      vi.mocked(fs.existsSync).mockImplementation((p: any) => p === 'C:\\another\\bin\\sclang.exe');
      const path = discoverSclangPath('win32');
      expect(path).toBe('C:\\another\\bin\\sclang.exe');
    } finally {
      process.env.PATH = originalEnv;
    }
  });

  it('should return null when no binary exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const path = discoverSclangPath('darwin');
    expect(path).toBeNull();
  });
});
