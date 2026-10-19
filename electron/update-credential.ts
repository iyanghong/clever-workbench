import { execFile } from 'node:child_process';

// Use the user's existing Git credential helper (normally macOS Keychain).
// Never persist, return to renderer, or include its output in an error/log.
export function localGitHubCredential(directory: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const child = execFile(
      '/usr/bin/git',
      ['-c', 'credential.interactive=false', 'credential', 'fill'],
      {
        cwd: directory,
        timeout: 10_000,
        maxBuffer: 32 * 1024,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GCM_INTERACTIVE: 'never',
          GIT_ASKPASS: '',
          SSH_ASKPASS: '',
        },
      },
      (error, stdout) => {
        if (error) return resolve(undefined);
        const token = stdout
          .split('\n')
          .find((line) => line.startsWith('password='))
          ?.slice(9);
        resolve(token || undefined);
      },
    );
    child.stdin?.on('error', () => {});
    child.stdin?.end('protocol=https\nhost=github.com\npath=iyanghong/clever-workbench.git\n\n');
  });
}
