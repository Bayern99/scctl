import fs from 'fs';
import path from 'path';

export function discoverSclangPath(platform: string = process.platform): string | null {
  if (platform === 'darwin') {
    const defaultMacPath = '/Applications/SuperCollider.app/Contents/MacOS/sclang';
    if (fs.existsSync(defaultMacPath)) {
      return defaultMacPath;
    }
  } else if (platform === 'win32') {
    const defaultWinPath = 'C:\\Program Files\\SuperCollider\\sclang.exe';
    if (fs.existsSync(defaultWinPath)) {
      return defaultWinPath;
    }
  } else {
    // Linux
    const paths = ['/usr/bin/sclang', '/usr/local/bin/sclang'];
    for (const p of paths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  }
  return null;
}
