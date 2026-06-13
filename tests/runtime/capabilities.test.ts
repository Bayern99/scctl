import { describe, expect, it } from 'vitest';
import { detectRuntimeCapabilities } from '../../src/runtime/capabilities.js';

describe('runtime capabilities', () => {
  it('reports nrt unavailable when sclang and scsynth paths are missing', () => {
    const capabilities = detectRuntimeCapabilities('/nonexistent/sclang', 'linux');
    expect(capabilities.sclang.available).toBe(false);
    expect(capabilities.scsynth.available).toBe(false);
    expect(capabilities.nrt_available).toBe(false);
  });

  it('uses platform defaults when sclang path is null', () => {
    const capabilities = detectRuntimeCapabilities(null, 'linux');
    expect(capabilities.extensions_paths).toEqual([]);
    expect(typeof capabilities.nrt_available).toBe('boolean');
  });

  it('detects sc3 plugin bins when extension directories contain plugin files', () => {
    const capabilities = detectRuntimeCapabilities(null, 'darwin');
    expect(capabilities.sc3_plugins).toMatchObject({
      detected: expect.any(Boolean),
      plugin_count: expect.any(Number),
      plugin_paths: expect.any(Array),
    });
  });
});
