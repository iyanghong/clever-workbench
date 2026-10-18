import { spawn } from 'node:child_process';
import electron from 'electron';
await import('./build-electron.mjs');
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' });
let app;
const stop = () => {
  app?.kill();
  vite.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (let i = 0; i < 100; i++) {
  try {
    const response = await fetch('http://127.0.0.1:5173');
    if (response.ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}
const env = { ...process.env, VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173' };
delete env.ELECTRON_RUN_AS_NODE;
app = spawn(electron, ['.'], { stdio: 'inherit', env });
app.on('exit', () => {
  vite.kill();
  process.exit();
});
