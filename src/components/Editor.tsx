import { useEditor, EditorContent, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import {
  TextBIcon,
  TextItalicIcon,
  ListBulletsIcon,
  ListChecksIcon,
  CodeIcon,
  ImageIcon,
  QuotesIcon,
  TextHOneIcon,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
const lowlight = createLowlight(common);
export function Editor({
  content,
  onChange,
  onError,
  readOnly = false,
  pendingRef,
}: {
  content: JSONContent;
  onChange: (content: JSONContent, markdown: string) => void;
  onError: (message: string) => void;
  readOnly?: boolean;
  pendingRef: React.MutableRefObject<Promise<void>>;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (preview) previewDialog.current?.showModal();
  }, [preview]);
  const [importing, setImporting] = useState(0);
  const change = useRef(onChange);
  change.current = onChange;
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, link: { openOnClick: false, autolink: true } }),
      Markdown,
      Image.configure({ allowBase64: false }),
      Placeholder.configure({
        placeholder: '写下过程、结论，或直接粘贴截图…\n支持 Markdown、代码块和勾选清单。',
      }),
      TaskList,
      TaskItem.configure({ nested: false }),
      CodeBlockLowlight.configure({ lowlight }),
    ],
    content,
    editable: !readOnly,
    onUpdate: ({ editor }) => change.current(editor.getJSON(), editor.getMarkdown()),
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': '工作内容',
        'aria-multiline': 'true',
        spellcheck: 'false',
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (files.length) {
          event.preventDefault();
          void importFiles(files);
          return true;
        }
        const raw = event.clipboardData?.getData('text/plain') ?? '';
        if (/!\[[^\]]*\]\(https?:\/\//i.test(raw)) {
          event.preventDefault();
          editor?.commands.insertContent(
            raw.replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g, '[$1]($2)'),
            { contentType: 'markdown' },
          );
          return true;
        }
        return false;
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (files.length) {
          event.preventDefault();
          void importFiles(files);
          return true;
        }
        return false;
      },
      handleClick: (_view, _pos, event) => {
        const image = (event.target as HTMLElement).closest('img');
        if (image) {
          setPreview(image.src);
          return false;
        }
        const link = (event.target as HTMLElement).closest('a');
        if (link) {
          event.preventDefault();
          void window.desktop.openExternal(link.href).catch((e) => onError(e.message));
          return true;
        }
        return false;
      },
    },
  });
  function importFiles(files: File[]) {
    const job = importBatch(files);
    pendingRef.current = Promise.all([pendingRef.current, job]).then(() => undefined);
    return job;
  }
  async function importBatch(files: File[]) {
    if (!editor) return;
    setImporting((n) => n + files.length);
    for (const file of files) {
      try {
        if (file.size > 20 * 1024 * 1024) throw new Error('单张图片不能超过 20 MB');
        const asset = await window.desktop.importImage(
          new Uint8Array(await file.arrayBuffer()),
          file.name,
        );
        if (!editor.isDestroyed)
          editor.chain().focus().setImage({ src: asset.src, alt: asset.name }).run();
      } catch (e) {
        onError(`${file.name}：${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setImporting((n) => n - 1);
      }
    }
  }
  function pick() {
    const job = pickBatch();
    pendingRef.current = Promise.all([pendingRef.current, job]).then(() => undefined);
    return job;
  }
  async function pickBatch() {
    try {
      const { assets, errors } = await window.desktop.chooseImages();
      assets.forEach((asset) =>
        editor?.chain().focus().setImage({ src: asset.src, alt: asset.name }).run(),
      );
      if (errors.length) onError(errors.join('\n'));
    } catch (e) {
      onError(String(e));
    }
  }
  if (!editor) return null;
  const tools = [
    {
      name: '标题',
      icon: TextHOneIcon,
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      active: editor.isActive('heading'),
    },
    {
      name: '加粗',
      icon: TextBIcon,
      action: () => editor.chain().focus().toggleBold().run(),
      active: editor.isActive('bold'),
    },
    {
      name: '斜体',
      icon: TextItalicIcon,
      action: () => editor.chain().focus().toggleItalic().run(),
      active: editor.isActive('italic'),
    },
    {
      name: '无序列表',
      icon: ListBulletsIcon,
      action: () => editor.chain().focus().toggleBulletList().run(),
      active: editor.isActive('bulletList'),
    },
    {
      name: '清单',
      icon: ListChecksIcon,
      action: () => editor.chain().focus().toggleTaskList().run(),
      active: editor.isActive('taskList'),
    },
    {
      name: '引用',
      icon: QuotesIcon,
      action: () => editor.chain().focus().toggleBlockquote().run(),
      active: editor.isActive('blockquote'),
    },
    {
      name: '代码块',
      icon: CodeIcon,
      action: () => editor.chain().focus().toggleCodeBlock().run(),
      active: editor.isActive('codeBlock'),
    },
  ];
  return (
    <div className="editor-wrap">
      <div className="editor-tools" role="toolbar" aria-label="文字格式">
        {tools.map((item) => (
          <button
            key={item.name}
            type="button"
            title={item.name}
            aria-label={item.name}
            aria-pressed={item.active}
            disabled={readOnly}
            onClick={item.action}
          >
            <item.icon size={17} />
          </button>
        ))}
        <i />
        {editor.isActive('image') && (
          <button
            title="移除图片"
            aria-label="移除图片"
            onClick={() => editor.chain().focus().deleteSelection().run()}
          >
            ×
          </button>
        )}
        <button title="插入图片" aria-label="插入图片" onClick={pick} disabled={readOnly}>
          <ImageIcon size={18} />
        </button>
        <span className="editor-format">Markdown</span>
      </div>
      {editor.isActive('codeBlock') && (
        <div className="code-language">
          <label>
            代码语言{' '}
            <select
              aria-label="代码语言"
              value={editor.getAttributes('codeBlock').language ?? ''}
              onChange={(e) =>
                editor
                  .chain()
                  .focus()
                  .updateAttributes('codeBlock', { language: e.target.value })
                  .run()
              }
            >
              <option value="">纯文本</option>
              {[
                'javascript',
                'typescript',
                'json',
                'css',
                'html',
                'python',
                'bash',
                'sql',
                'rust',
                'go',
              ].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <button
            onClick={() => {
              const { $from } = editor.state.selection;
              void navigator.clipboard
                .writeText($from.parent.textContent)
                .catch((e) => onError(e.message));
            }}
          >
            复制代码
          </button>
        </div>
      )}
      <EditorContent editor={editor} />
      {importing > 0 && <div className="save-indicator">正在导入 {importing} 张图片…</div>}
      {preview && (
        <dialog
          ref={previewDialog}
          className="image-preview"
          onCancel={() => setPreview(null)}
          onClick={() => setPreview(null)}
        >
          <button aria-label="关闭图片" onClick={() => setPreview(null)}>
            关闭
          </button>
          <img src={preview} alt="图片原图" />
        </dialog>
      )}
    </div>
  );
}
