import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, X, Trash2, Chrome, ClipboardPaste } from 'lucide-react';
import { attachmentStore, SessionAttachment } from '../../services/attachmentStore';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Loads a session attachments and hands back object URLs that are cleaned up on change. */
function useAttachments(sessionId: string, version: number) {
  const [items, setItems] = useState<(SessionAttachment & { url: string })[]>([]);

  const reload = useCallback(async () => {
    const list = await attachmentStore.listForSession(sessionId);
    setItems((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.url));
      return list.map((a) => ({ ...a, url: URL.createObjectURL(a.blob) }));
    });
  }, [sessionId]);

  useEffect(() => {
    void reload();
  }, [reload, version]);

  useEffect(
    () => () => {
      setItems((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p.url));
        return [];
      });
    },
    []
  );

  return { items, reload };
}

export const ImageLightbox: React.FC<{
  src: string;
  caption?: string;
  onClose: () => void;
}> = ({ src, caption, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/90 flex flex-col items-center justify-center p-6 cursor-zoom-out"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 p-2 text-slate-300 hover:text-white bg-slate-900/80 border border-slate-700"
        onClick={onClose}
        title="Close (Esc)"
      >
        <X className="w-5 h-5" />
      </button>
      <img src={src} alt={caption || 'attachment'} className="max-w-full max-h-[85vh] object-contain shadow-2xl" />
      {caption && <p className="mt-3 text-xs text-slate-400 font-mono max-w-2xl text-center truncate">{caption}</p>}
    </div>
  );
};

interface AttachmentPickerProps {
  sessionId: string;
  /** Changes whenever something is added in the background (e.g. an extension proof capture). */
  version?: number;
  /** View only: no adding, pasting or removing. Used in history. */
  readOnly?: boolean;
  /** Listen for Ctrl+V anywhere while mounted. Only enable for one picker at a time. */
  enablePaste?: boolean;
}

export const AttachmentPicker: React.FC<AttachmentPickerProps> = ({
  sessionId,
  version = 0,
  readOnly = false,
  enablePaste = false,
}) => {
  const { items, reload } = useAttachments(sessionId, version);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [viewing, setViewing] = useState<{ url: string; caption: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    async (files: File[], source: 'upload' | 'paste') => {
      const images = files.filter((f) => f.type.startsWith('image/'));
      if (images.length === 0) {
        setError('Only image files can be attached.');
        return;
      }
      setBusy(true);
      setError('');
      for (const file of images) {
        try {
          await attachmentStore.add(sessionId, file, { name: file.name, source });
        } catch (e: any) {
          setError(e?.message || 'Could not attach that image.');
          break;
        }
      }
      setBusy(false);
      await reload();
    },
    [sessionId, reload]
  );

  useEffect(() => {
    if (!enablePaste || readOnly) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.items || [])
        .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
        .map((it) => it.getAsFile())
        .filter((f): f is File => Boolean(f));
      if (files.length > 0) {
        e.preventDefault();
        void addFiles(files, 'paste');
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [enablePaste, readOnly, addFiles]);

  const handleRemove = async (id: string) => {
    await attachmentStore.remove(id);
    await reload();
  };

  if (readOnly && items.length === 0) return null;

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void addFiles(Array.from(e.dataTransfer.files), 'upload');
          }}
          onClick={() => fileInput.current?.click()}
          className={`cursor-pointer border border-dashed px-4 py-5 text-center transition-all ${
            dragOver
              ? 'border-cyan-400 bg-cyan-500/10'
              : 'border-slate-700 bg-slate-950 hover:border-slate-500 hover:bg-slate-900/60'
          }`}
        >
          <ImagePlus className="w-5 h-5 mx-auto text-cyan-400 mb-1.5" />
          <p className="text-[11px] text-slate-300 font-bold">
            {busy ? 'Adding...' : 'Drop screenshots or photos here, or click to choose'}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5 flex items-center justify-center gap-1">
            <ClipboardPaste className="w-3 h-3" /> You can also paste with Ctrl+V.
            Proof screenshots from the extension (Alt+Shift+C) appear here on their own.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void addFiles(Array.from(e.target.files || []), 'upload');
              e.target.value = '';
            }}
          />
        </div>
      )}

      {error && <p className="text-[10px] text-rose-400 font-bold">{error}</p>}

      {items.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {items.map((a) => (
            <div key={a.id} className="group relative border border-slate-800 bg-slate-950 overflow-hidden">
              <button
                type="button"
                className="block w-full aspect-video bg-black cursor-zoom-in"
                onClick={() => setViewing({ url: a.url, caption: a.note || a.name })}
                title="Click to enlarge"
              >
                <img src={a.url} alt={a.name} className="w-full h-full object-cover" />
              </button>
              <div className="px-1.5 py-1 flex items-center justify-between gap-1 text-[9px] text-slate-500">
                <span className="truncate flex items-center gap-1" title={a.note || a.name}>
                  {a.source === 'extension' && <Chrome className="w-2.5 h-2.5 text-emerald-400 flex-shrink-0" />}
                  {a.source === 'extension' ? 'proof' : formatBytes(a.size)}
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => handleRemove(a.id)}
                    className="text-slate-600 hover:text-rose-400 flex-shrink-0"
                    title="Remove image"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {viewing && <ImageLightbox src={viewing.url} caption={viewing.caption} onClose={() => setViewing(null)} />}
    </div>
  );
};
