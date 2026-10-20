import { defineConfig, type IndexHtmlTransformContext } from 'vite';
import react from '@vitejs/plugin-react';
import { buildVditor } from './scripts/vditor.ts';
export default defineConfig(async () => ({
  resolve: { alias: [{ find: /^vditor$/, replacement: await buildVditor(import.meta.dirname) }] },
  plugins: [
    react(),
    {
      name: 'development-csp',
      transformIndexHtml(html: string, context: IndexHtmlTransformContext) {
        return context.server
          ? html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
          : html;
      },
    },
  ],
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: {
    target: 'es2022',
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'editor-model',
              test: /node_modules[\\/]prosemirror-[^\\/]+[\\/]/,
            },
            {
              name: 'code-highlighting',
              test: /node_modules[\\/](?:highlight\.js|lowlight)[\\/]/,
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  },
}));
