import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { fs: { allow: ['../..'] } },
  build: { target: 'es2022', chunkSizeWarningLimit: 1800 },
});
