import { execFile } from 'node:child_process';

export function runProcess(file: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { ...options, windowsHide: true, shell: false, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const code = error.killed ? 'CLI_TIMEOUT' : /MODULE_NOT_FOUND|Cannot find module/.test(stderr) ? 'CLI_INSTALL_BROKEN' : error.code;
        reject(Object.assign(new Error(error.killed ? 'Local CLI timeout' : stderr || error.message), { code }));
      } else resolve(stdout);
    });
    // The prompt is an argument. A piped stdin must reach EOF or the CLI may
    // wait indefinitely for additional input before starting the request.
    child.stdin?.on('error', () => { /* Process exit errors are handled above. */ });
    child.stdin?.end();
  });
}
