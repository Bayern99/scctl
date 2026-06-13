import fs from 'fs';
import os from 'os';
import path from 'path';
import { RuntimeCapabilities } from './driver-types.js';

function firstExistingPath(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function uniqueExistingDirs(candidates: string[]): string[] {
  return [...new Set(candidates.filter((candidate) => candidate && fs.existsSync(candidate)))];
}

function deriveMacResourcePath(sclangPath: string | null, name: string): string | null {
  if (!sclangPath) {
    return null;
  }

  const appContents = path.resolve(sclangPath, '..', '..');
  const candidate = path.join(appContents, 'Resources', name);
  return fs.existsSync(candidate) ? candidate : null;
}

function defaultSclangPathForPlatform(platform: NodeJS.Platform): string | null {
  if (platform === 'darwin') {
    return '/Applications/SuperCollider.app/Contents/MacOS/sclang';
  }
  if (platform === 'win32') {
    return 'C:\\Program Files\\SuperCollider\\sclang.exe';
  }

  return firstExistingPath(['/usr/bin/sclang', '/usr/local/bin/sclang']);
}

function defaultSiblingCandidates(
  sclangPath: string | null,
  platform: NodeJS.Platform,
  binaryName: 'scsynth' | 'supernova',
): string[] {
  const executable = platform === 'win32' ? `${binaryName}.exe` : binaryName;
  const candidates: string[] = [];

  if (sclangPath) {
    candidates.push(path.join(path.dirname(sclangPath), executable));
    const macResourcePath = deriveMacResourcePath(sclangPath, executable);
    if (macResourcePath) {
      candidates.push(macResourcePath);
    }
  }

  if (platform === 'darwin') {
    candidates.push(`/Applications/SuperCollider.app/Contents/Resources/${executable}`);
  } else if (platform === 'win32') {
    candidates.push(`C:\\Program Files\\SuperCollider\\${executable}`);
  } else {
    candidates.push(`/usr/bin/${executable}`, `/usr/local/bin/${executable}`);
  }

  return [...new Set(candidates)];
}

function defaultExtensionsPaths(platform: NodeJS.Platform): string[] {
  const home = os.homedir();
  if (platform === 'darwin') {
    return uniqueExistingDirs([
      path.join(home, 'Library', 'Application Support', 'SuperCollider', 'Extensions'),
    ]);
  }
  if (platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
    return uniqueExistingDirs([path.join(appData, 'SuperCollider', 'Extensions')]);
  }

  return uniqueExistingDirs([
    path.join(home, '.local', 'share', 'SuperCollider', 'Extensions'),
  ]);
}

function defaultQuarksPaths(platform: NodeJS.Platform): string[] {
  const home = os.homedir();
  if (platform === 'darwin') {
    return uniqueExistingDirs([
      path.join(home, 'Library', 'Application Support', 'SuperCollider', 'downloaded-quarks'),
    ]);
  }
  if (platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
    return uniqueExistingDirs([path.join(appData, 'SuperCollider', 'downloaded-quarks')]);
  }

  return uniqueExistingDirs([
    path.join(home, '.local', 'share', 'SuperCollider', 'downloaded-quarks'),
  ]);
}

function detectPluginPaths(
  sclangPath: string | null,
  extensionsPaths: string[],
  platform: NodeJS.Platform,
): string[] {
  const candidates = new Set<string>();

  if (platform === 'darwin' && sclangPath) {
    const macPluginDir = deriveMacResourcePath(sclangPath, 'plugins');
    if (macPluginDir) {
      candidates.add(macPluginDir);
    }
  }

  for (const extensionPath of extensionsPaths) {
    candidates.add(extensionPath);
  }

  return [...candidates].filter((candidate) => fs.existsSync(candidate));
}

function countPluginBinaries(pluginPaths: string[]): number {
  let count = 0;

  for (const pluginPath of pluginPaths) {
    const queue = [pluginPath];
    while (queue.length > 0) {
      const current = queue.pop()!;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const resolved = path.join(current, entry.name);
        if (entry.isDirectory()) {
          queue.push(resolved);
          continue;
        }

        if (/\.(scx|so|dylib)$/i.test(entry.name)) {
          count += 1;
        }
      }
    }
  }

  return count;
}

export function detectRuntimeCapabilities(
  sclangPath: string | null,
  platform: NodeJS.Platform = process.platform,
): RuntimeCapabilities {
  const fallbackSclang = defaultSclangPathForPlatform(platform);
  const resolvedSclang = firstExistingPath([sclangPath ?? '', fallbackSclang ?? '']);
  const scsynthPath = firstExistingPath(
    defaultSiblingCandidates(resolvedSclang, platform, 'scsynth'),
  );
  const supernovaPath = firstExistingPath(
    defaultSiblingCandidates(resolvedSclang, platform, 'supernova'),
  );
  const extensionsPaths = defaultExtensionsPaths(platform);
  const quarksPaths = defaultQuarksPaths(platform);
  const pluginPaths = detectPluginPaths(resolvedSclang, extensionsPaths, platform);
  const pluginCount = countPluginBinaries(pluginPaths);

  return {
    sclang: {
      available: Boolean(resolvedSclang),
      path: resolvedSclang,
    },
    scsynth: {
      available: Boolean(scsynthPath),
      path: scsynthPath,
    },
    supernova: {
      available: Boolean(supernovaPath),
      path: supernovaPath,
    },
    extensions_paths: extensionsPaths,
    quarks_paths: quarksPaths,
    sc3_plugins: {
      detected: pluginCount > 0,
      plugin_count: pluginCount,
      plugin_paths: pluginPaths,
    },
    nrt_available: Boolean(resolvedSclang && scsynthPath),
  };
}
