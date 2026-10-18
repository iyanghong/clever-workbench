import { _electron } from '@playwright/test';
// Run the same behavior checks against development output or an installed executable.
export const electron = {
  launch(options: NonNullable<Parameters<typeof _electron.launch>[0]>) {
    const executablePath = process.env.CWB_TEST_EXECUTABLE;
    if (!executablePath) return _electron.launch(options);
    const env = { ...options.env };
    delete env.VITE_DEV_SERVER_URL;
    return _electron.launch({ ...options, env, executablePath, args: [] });
  },
};
