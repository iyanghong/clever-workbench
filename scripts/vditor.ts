import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { build, type Plugin } from 'esbuild';
import path from 'node:path';

// Pin source anchors so an upstream upgrade cannot silently drop the undo fix.
export function vditorHistoryPatch(directory: string): Plugin {
  const root = path.join(directory, 'node_modules/vditor');
  function replaceOnce(source: string, before: string, after: string) {
    if (source.split(before).length !== 2) {
      throw new Error('Vditor source changed; review the history patch before building.');
    }
    return source.replace(before, after);
  }
  return {
    name: 'vditor-ir-history',
    async setup(build) {
      const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
      if (manifest.version !== '4.0.1') throw new Error('The history patch requires Vditor 4.0.1.');
      build.onResolve({ filter: /^vditor$/ }, () => ({ path: path.join(root, 'src/index.ts') }));
      build.onLoad(
        { filter: /vditor[/\\]src[/\\]ts[/\\](ir[/\\](index|process)|undo[/\\]index)\.ts$/ },
        async ({ path: filename }) => {
          let source = await readFile(filename, 'utf8');
          const relative = path.relative(root, filename).split(path.sep).join('/');
          if (relative === 'src/ts/ir/index.ts') {
            source = replaceOnce(
              source,
              'public processTimeoutId: number;',
              `public processTimeoutId: number;
    public flushPendingProcess?: () => void;
    public historyPending = false;`,
            );
          } else if (relative === 'src/ts/ir/process.ts') {
            source = replaceOnce(
              source,
              '    vditor.ir.processTimeoutId = window.setTimeout(() => {',
              `    vditor.ir.historyPending = options.enableAddUndoStack;
    vditor.undo.resetIcon(vditor);
    const process = () => {`,
            );
            source = replaceOnce(
              source,
              '        const text = getMarkdown(vditor);',
              `        clearTimeout(vditor.ir.processTimeoutId);
        vditor.ir.flushPendingProcess = undefined;
        vditor.ir.historyPending = false;
        const text = getMarkdown(vditor);`,
            );
            source = replaceOnce(
              source,
              '    }, vditor.options.undoDelay);',
              `        vditor.undo.resetIcon(vditor);
    };
    vditor.ir.flushPendingProcess = process;
    vditor.ir.processTimeoutId = window.setTimeout(process, vditor.options.undoDelay);`,
            );
          } else {
            // esbuild uses native ESM namespace semantics, unlike the upstream webpack build.
            source = replaceOnce(
              source,
              'import * as DiffMatchPatch from "diff-match-patch";',
              'import DiffMatchPatch from "diff-match-patch";',
            );
            source = replaceOnce(
              source,
              '        const text = this.addCaret(vditor, true);',
              `        const text = this.addCaret(vditor, true);
        // Cursor markers and cancelled composition must not invalidate redo.
        if (vditor.currentMode === "ir" && this.ir.undoStack.length > 0 &&
            vditor.lute.VditorIRDOM2Md(text) === vditor.lute.VditorIRDOM2Md(this.ir.lastText)) {
            return;
        }`,
            );
            source = replaceOnce(
              source,
              `        if (!vditor.toolbar) {
            return;
        }

        if (this[vditor.currentMode].undoStack.length > 1) {`,
              `        if (!vditor.toolbar) {
            return;
        }

        if (this[vditor.currentMode].undoStack.length > 1 ||
            (vditor.currentMode === "ir" && vditor.ir.historyPending)) {`,
            );
            for (const action of ['undo', 'redo']) {
              source = replaceOnce(
                source,
                `    public ${action}(vditor: IVditor) {`,
                `    public ${action}(vditor: IVditor) {
        if (vditor.currentMode === "ir") {
            if (vditor.ir.composingLock ||
                vditor.ir.element.getAttribute("contenteditable") === "false") {
                return;
            }
            vditor.ir.flushPendingProcess?.();
        }`,
              );
            }
          }
          return { contents: source, loader: 'ts' };
        },
      );
    },
  };
}

export async function buildVditor(directory: string) {
  const outfile = path.join(directory, 'node_modules/.cache/workbench-vditor.js');
  await build({
    stdin: { contents: "export { default } from 'vditor';", resolveDir: directory },
    outfile,
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    // Upstream subclasses redeclare inherited fields without initializing them.
    tsconfigRaw: { compilerOptions: { useDefineForClassFields: false } },
    loader: { '.less': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"', VDITOR_VERSION: '"4.0.1"' },
    plugins: [vditorHistoryPatch(directory)],
  });
  for (const file of ['js/lute/lute.min.js', 'js/i18n/zh_CN.js', 'js/icons/ant.js']) {
    const destination = path.join(directory, 'public/editor-vendor/dist', file);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(directory, 'node_modules/vditor/dist', file), destination);
  }
  return outfile;
}
