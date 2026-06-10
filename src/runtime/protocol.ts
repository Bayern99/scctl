export interface RenderOptions {
  durationSec: number;
  outPath: string;
  userCode: string;
}

export const SC_RUNTIME_ERROR_PATTERNS = [
  /(^|\n)ERROR:/m,
  /FAILURE IN SERVER/m,
  /Exception in interpreter/m,
  /Command line parse failed/m,
  /Primitive '_[^']+' failed/m,
];

export function containsScRuntimeError(output: string): boolean {
  return SC_RUNTIME_ERROR_PATTERNS.some((pattern) => pattern.test(output));
}

export function escapeScString(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

export function makeMarker(label: string): string {
  const normalized = label.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase();
  return `__SCCTL_${normalized}_${Date.now()}_${Math.floor(Math.random() * 10_000)}__`;
}

function wrapBlock(lines: string[]): string {
  return ['(', ...lines, ')', ''].join('\n');
}

export function buildPingScript(doneMarker: string): string {
  return wrapBlock([`"${doneMarker}".postln;`]);
}

export function buildWaitForBootScript(doneMarker: string): string {
  return wrapBlock([`s.waitForBoot({ "${doneMarker}".postln; });`]);
}

export function buildServerRunningScript(
  readyMarker: string,
  notReadyMarker: string,
): string {
  return wrapBlock([
    `(s.serverRunning).if({ "${readyMarker}".postln; }, { "${notReadyMarker}".postln; });`,
  ]);
}

export function buildEvalScript(userCode: string, doneMarker: string): string {
  const escapedCode = escapeScString(userCode);
  return wrapBlock([
    `"${escapedCode}".interpret;`,
    `"${doneMarker}".postln;`,
  ]);
}

export function buildResetScript(doneMarker: string): string {
  return wrapBlock([
    'Routine.run({',
    '  CmdPeriod.run;',
    '  s.freeAll;',
    '  s.sync;',
    `  "${doneMarker}".postln;`,
    '});',
  ]);
}

export function buildRenderStartScript(
  { outPath, userCode }: RenderOptions,
  doneMarker: string,
): string {
  const escapedCode = escapeScString(userCode);
  const escapedOut = escapeScString(outPath);

  return wrapBlock([
    'Routine.run({',
    `  s.prepareForRecord("${escapedOut}");`,
    '  s.sync;',
    '  s.record;',
    '  s.sync;',
    `  "${escapedCode}".interpret;`,
    `  "${doneMarker}".postln;`,
    '});',
  ]);
}

export function buildRenderStopScript(doneMarker: string): string {
  return wrapBlock([
    'Routine.run({',
    '  s.stopRecording;',
    '  s.sync;',
    '  CmdPeriod.run;',
    `  "${doneMarker}".postln;`,
    '});',
  ]);
}
