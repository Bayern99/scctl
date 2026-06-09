import { spawn, ChildProcessWithoutNullStreams } from 'child_process';

export class SclangController {
  private process: ChildProcessWithoutNullStreams | null = null;
  private path: string;
  private outputBuffer: string = '';

  constructor(sclangPath: string) {
    this.path = sclangPath;
  }

  public boot(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // -i scide launches sclang in interactive mode
        this.process = spawn(this.path, ['-i', 'scide']);
        
        this.process.stdout.on('data', (data) => {
          this.outputBuffer += data.toString();
        });

        this.process.stderr.on('data', (data) => {
          this.outputBuffer += data.toString();
        });

        // Wait brief moment for interpreter to boot
        setTimeout(() => {
          resolve();
        }, 1500);
      } catch (err) {
        reject(err);
      }
    });
  }

  public async execute(code: string): Promise<{ success: boolean; output: string }> {
    if (!this.process) {
      throw new Error('sclang is not booted. Call boot() first.');
    }

    const delim = 'SC_EVAL_DONE_' + Date.now();
    const wrappedCode = `
try {
  {
    ${code}
  }.value;
  "\\n${delim}_OK".postln;
} { |error|
  "\\n${delim}_ERR".postln;
  error.reportError;
};
`;

    return new Promise((resolve) => {
      let runBuffer = '';
      const dataHandler = (data: Buffer) => {
        const chunk = data.toString();
        runBuffer += chunk;
        this.outputBuffer += chunk;

        if (runBuffer.includes(`${delim}_OK`)) {
          cleanup();
          resolve({
            success: true,
            output: runBuffer.replace(`${delim}_OK`, '').trim(),
          });
        } else if (runBuffer.includes(`${delim}_ERR`)) {
          cleanup();
          resolve({
            success: false,
            output: runBuffer.replace(`${delim}_ERR`, '').trim(),
          });
        }
      };

      const cleanup = () => {
        this.process?.stdout.removeListener('data', dataHandler);
      };

      this.process!.stdout.on('data', dataHandler);
      this.process!.stdin.write(wrappedCode + '\x0c'); // Form feed character evaluates in sclang
    });
  }

  public getLogs(): string {
    return this.outputBuffer;
  }

  public stop(): void {
    if (this.process) {
      // Send CmdPeriod to silence all audio
      this.process.stdin.write('CmdPeriod.run; Server.killAll;\n\x0c');
      setTimeout(() => {
        this.process?.kill('SIGKILL');
        this.process = null;
      }, 500);
    }
  }
}
