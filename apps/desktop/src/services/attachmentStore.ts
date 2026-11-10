/**
 * Local storage for images attached to a focus session (screenshots, photos, and proof
 * captures sent by the extension). Uses IndexedDB because localStorage is far too small
 * for images. Everything stays on this machine.
 */

export interface SessionAttachment {
  id: string;
  sessionId: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  source: 'upload' | 'paste' | 'extension';
  note?: string; // e.g. the page title for extension proof captures
  blob: Blob;
}

const DB_NAME = 'focuswatch_attachments';
const STORE = 'attachments';
const MAX_IMAGES_PER_SESSION = 12;
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_DIMENSION = 1920;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('sessionId', 'sessionId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = run(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

/** Shrinks large images so a screenshot-heavy history does not eat the disk quota. */
async function compressImage(blob: Blob): Promise<Blob> {
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') return blob;
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && blob.size < 1.5 * 1024 * 1024) {
      bitmap.close?.();
      return blob;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const out: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.86));
    return out && out.size < blob.size ? out : blob;
  } catch {
    return blob;
  }
}

export const attachmentStore = {
  MAX_IMAGES_PER_SESSION,

  async add(
    sessionId: string,
    file: Blob,
    meta: { name?: string; source: SessionAttachment['source']; note?: string }
  ): Promise<SessionAttachment> {
    if (!file.type.startsWith('image/')) throw new Error('Only image files can be attached.');
    if (file.size > MAX_INPUT_BYTES) throw new Error('Image is larger than 15 MB.');

    const existing = await this.listForSession(sessionId);
    if (existing.length >= MAX_IMAGES_PER_SESSION) {
      throw new Error(`A session can hold at most ${MAX_IMAGES_PER_SESSION} images.`);
    }

    const stored = await compressImage(file);
    const att: SessionAttachment = {
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      sessionId,
      name: meta.name || (file as File).name || 'image',
      type: stored.type || file.type,
      size: stored.size,
      createdAt: new Date().toISOString(),
      source: meta.source,
      note: meta.note,
      blob: stored,
    };
    await tx('readwrite', (s) => s.put(att));
    return att;
  },

  async listForSession(sessionId: string): Promise<SessionAttachment[]> {
    try {
      const all = await tx<SessionAttachment[]>('readonly', (s) =>
        s.index('sessionId').getAll(IDBKeyRange.only(sessionId))
      );
      return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } catch {
      return [];
    }
  },

  async countForSession(sessionId: string): Promise<number> {
    try {
      return await tx<number>('readonly', (s) => s.index('sessionId').count(IDBKeyRange.only(sessionId)));
    } catch {
      return 0;
    }
  },

  async remove(id: string): Promise<void> {
    try {
      await tx('readwrite', (s) => s.delete(id));
    } catch {}
  },

  async removeAllForSession(sessionId: string): Promise<void> {
    const items = await this.listForSession(sessionId);
    await Promise.all(items.map((a) => this.remove(a.id)));
  },
};
