import React, { useState, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import {
  FileText,
  Plus,
  Search,
  Zap,
  Trash2,
  X,
  CheckCircle2,
  Tag,
  AlertCircle,
  ChevronsRight,
} from 'lucide-react';
import {
  DrawerMode,
  DRAWER_MODE_KEY,
  normalizeMode,
  nextModeOnToggle,
  setDrawerMode,
} from '../shared/noteDrawerState';

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// Preset tags for quick categorization
const PRESET_TAGS = ['ideas', 'todo', 'bugs', 'research', 'pricing', 'urgent'];

let drawerContainer: HTMLElement | null = null;
let shadowRootRef: ShadowRoot | null = null;
let reactRootRef: Root | null = null;
let drawerMode: DrawerMode = 'closed';
let hideTimer: ReturnType<typeof setTimeout> | null = null;

// Identifies this tab's drawer so it can ignore its own storage writes when they echo back.
const INSTANCE_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);

function sanitizeWidth(val: unknown): number {
  const minW = 280;
  const maxW = Math.max(minW, Math.floor(window.innerWidth * 0.75));
  const defaultW = Math.min(450, Math.max(320, Math.floor(window.innerWidth * 0.3)));

  if (typeof val !== 'number' || isNaN(val)) return defaultW;
  if (val < minW || val > window.innerWidth * 0.85) return defaultW;

  return Math.max(minW, Math.min(maxW, val));
}

let currentDrawerWidth = sanitizeWidth(null);

/** Alt+N, the popup button and the extension shortcut all end up here. */
export function toggleNoteDrawer(): void {
  requestMode(nextModeOnToggle(drawerMode));
}

/** Changes the drawer in this tab right away, and in every other tab through storage. */
function requestMode(mode: DrawerMode): void {
  applyDrawerMode(mode);
  void setDrawerMode(mode);
}

function applyDrawerMode(mode: DrawerMode): void {
  drawerMode = mode;
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (mode === 'closed') {
    if (!drawerContainer) return;
    renderDrawerApp();
    hideTimer = setTimeout(() => {
      if (drawerMode === 'closed' && drawerContainer) {
        drawerContainer.style.setProperty('display', 'none', 'important');
      }
    }, 250);
    return;
  }
  mountDrawerDOM();
}

let syncStarted = false;

/** Reads the shared drawer state once, then follows every change made in any tab. */
export function initNoteDrawerSync(): void {
  if (syncStarted || typeof chrome === 'undefined' || !chrome.storage?.local) return;
  syncStarted = true;

  chrome.storage.local.get([DRAWER_MODE_KEY, 'drawerWidth'], (res) => {
    currentDrawerWidth = sanitizeWidth(res?.drawerWidth);
    applyDrawerMode(normalizeMode(res?.[DRAWER_MODE_KEY]));
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.drawerWidth) {
      currentDrawerWidth = sanitizeWidth(changes.drawerWidth.newValue);
      if (drawerContainer) {
        drawerContainer.style.setProperty('width', `${currentDrawerWidth}px`, 'important');
        renderDrawerApp();
      }
    }
    if (changes[DRAWER_MODE_KEY]) {
      const mode = normalizeMode(changes[DRAWER_MODE_KEY].newValue);
      if (mode !== drawerMode) applyDrawerMode(mode);
    }
  });
}

function mountDrawerDOM(): void {
  if (!drawerContainer) {
    drawerContainer = document.createElement('div');
    drawerContainer.id = 'focuswatch-note-drawer-host';
    drawerContainer.style.cssText = `
      position: fixed !important;
      top: 0px !important;
      right: 0px !important;
      width: ${currentDrawerWidth}px !important;
      height: 100vh !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      transform: none !important;
    `;
    const targetParent = document.documentElement || document.body;
    targetParent.appendChild(drawerContainer);

    shadowRootRef = drawerContainer.attachShadow({ mode: 'open' });

    const styleEl = document.createElement('style');
    styleEl.textContent = `
      :host {
        /* No display rule here: an !important :host rule beats the inline display:none used to hide the drawer. */
        position: fixed !important;
        top: 0px !important;
        right: 0px !important;
        height: 100vh !important;
        z-index: 2147483647 !important;
        pointer-events: none !important;
      }
      * {
        box-sizing: border-box !important;
        margin: 0;
        padding: 0;
      }
      .drawer-wrapper {
        position: absolute !important;
        top: 0 !important;
        right: 0 !important;
        width: 100% !important;
        height: 100vh !important;
        background: #030712 !important;
        border-left: 1px solid #1e293b !important;
        box-shadow: none;
        color: #f8fafc !important;
        display: flex !important;
        flex-direction: column !important;
        pointer-events: auto !important;
        transform: translateX(100%);
        transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
        font-size: 11px !important;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
        z-index: 2147483647 !important;
      }
      .drawer-wrapper.open {
        transform: translateX(0) !important;
        box-shadow: -10px 0 30px rgba(0, 0, 0, 0.8) !important;
      }
      .resize-handle {
        position: absolute !important;
        left: -6px !important;
        top: 0 !important;
        bottom: 0 !important;
        width: 12px !important;
        cursor: ew-resize !important;
        z-index: 2147483648 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        background: transparent !important;
        user-select: none !important;
      }
      .resize-handle:hover, .resize-handle.dragging {
        background: rgba(16, 185, 129, 0.2) !important;
      }
      .resize-bar {
        width: 4px !important;
        height: 40px !important;
        background: #334155 !important;
        border-radius: 2px !important;
        transition: background 0.2s ease !important;
      }
      .resize-handle:hover .resize-bar, .resize-handle.dragging .resize-bar {
        background: #10b981 !important;
      }
      input, textarea, button {
        font-family: inherit;
        font-size: 11px;
      }
      /* Custom Thin Scrollbar Rules */
      ::-webkit-scrollbar { width: 4px; height: 2px; }
      ::-webkit-scrollbar-track { background: #020617; }
      ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 2px; }
      ::-webkit-scrollbar-thumb:hover { background: #10b981; }

      .tag-filter-bar {
        scrollbar-width: thin !important;
        scrollbar-color: #1e293b #020617 !important;
      }
      .tag-filter-bar::-webkit-scrollbar {
        height: 2px !important;
        width: 2px !important;
      }
      .tag-filter-bar::-webkit-scrollbar-track {
        background: #020617 !important;
      }
      .tag-filter-bar::-webkit-scrollbar-thumb {
        background: #1e293b !important;
        border-radius: 2px !important;
      }
      .tag-filter-bar::-webkit-scrollbar-thumb:hover {
        background: #10b981 !important;
      }

      /* Minimized: a small tab on the right edge that brings the drawer back */
      .minimized-tab {
        position: absolute !important;
        right: 0 !important;
        top: 42% !important;
        pointer-events: auto !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        gap: 8px !important;
        padding: 12px 7px !important;
        background: #030712 !important;
        border: 1px solid #10b981 !important;
        border-right: none !important;
        border-radius: 6px 0 0 6px !important;
        color: #34d399 !important;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
        font-size: 10px !important;
        font-weight: 800 !important;
        letter-spacing: 0.18em !important;
        cursor: pointer !important;
        box-shadow: -6px 0 18px rgba(0, 0, 0, 0.6) !important;
        transform: translateX(110%);
        transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), background 0.15s ease !important;
      }
      .minimized-tab.visible {
        transform: translateX(0) !important;
      }
      .minimized-tab:hover {
        background: #052e22 !important;
      }
      .minimized-tab .tab-label {
        writing-mode: vertical-rl !important;
      }
      .drawer-icon-btn {
        background: none !important;
        border: none !important;
        color: #64748b !important;
        cursor: pointer !important;
        padding: 4px !important;
        display: flex !important;
        align-items: center !important;
      }
      .drawer-icon-btn:hover {
        color: #f8fafc !important;
      }
    `;
    shadowRootRef.appendChild(styleEl);

    const reactAppMount = document.createElement('div');
    shadowRootRef.appendChild(reactAppMount);

    reactRootRef = createRoot(reactAppMount);
  }

  if (drawerContainer) {
    drawerContainer.style.setProperty('width', `${currentDrawerWidth}px`, 'important');
    drawerContainer.style.setProperty('display', 'block', 'important');
    drawerContainer.style.setProperty('visibility', 'visible', 'important');
    drawerContainer.style.setProperty('opacity', '1', 'important');
  }

  renderDrawerApp();
}

function renderDrawerApp(): void {
  if (reactRootRef) {
    reactRootRef.render(
      <NoteDrawerComponent
        mode={drawerMode}
        width={currentDrawerWidth}
        onClose={() => requestMode('closed')}
        onMinimize={() => requestMode('minimized')}
        onExpand={() => requestMode('open')}
      />
    );
  }
}

// Helper to scrub any previously pasted #tags from note content text.
// NOTE: must NOT trim here — this runs on every keystroke of the content
// textarea, and trimming would eat trailing spaces/newlines as the user types.
function scrubTagsFromContent(content: string, tags: string[]): string {
  let clean = content;
  if (tags && tags.length > 0) {
    tags.forEach((t) => {
      if (!t) return;
      const re = new RegExp(`\\s*#${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      clean = clean.replace(re, '');
    });
  }
  return clean;
}

interface NoteDrawerProps {
  mode: DrawerMode;
  width: number;
  onClose: () => void;
  onMinimize: () => void;
  onExpand: () => void;
}

const NoteDrawerComponent: React.FC<NoteDrawerProps> = ({ mode, width, onClose, onMinimize, onExpand }) => {
  const isOpen = mode === 'open';
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [exportSuccess, setExportSuccess] = useState(false);
  const [statusLog, setStatusLog] = useState<string | null>(null);
  const [drawerWidth, setDrawerWidth] = useState<number>(currentDrawerWidth);
  const [isDragging, setIsDragging] = useState(false);

  // Stop keyboard event leakage into host webpage via bubble phase
  useEffect(() => {
    const stopKeyLeak = (e: Event) => {
      const kbEvent = e as KeyboardEvent;
      if (kbEvent.altKey && (kbEvent.key === 'n' || kbEvent.key === 'N')) return;

      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
      }
    };

    const target = shadowRootRef;
    if (target) {
      target.addEventListener('keydown', stopKeyLeak, true);
      target.addEventListener('keyup', stopKeyLeak, true);
      target.addEventListener('keypress', stopKeyLeak, true);
    }
    return () => {
      if (target) {
        target.removeEventListener('keydown', stopKeyLeak, true);
        target.removeEventListener('keyup', stopKeyLeak, true);
        target.removeEventListener('keypress', stopKeyLeak, true);
      }
    };
  }, []);

  useEffect(() => {
    setDrawerWidth(width);
  }, [width]);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    try {
      chrome.storage.local.get(['tacticalNotes', 'tacticalNotesActive'], (res) => {
        const stored: NoteItem[] = Array.isArray(res?.tacticalNotes) ? res.tacticalNotes : [];
        if (stored.length > 0) {
          // Older versions pasted #tags into the text. Remove them, but never touch whitespace:
          // another tab may be in the middle of typing.
          const cleaned = stored.map((note) => ({ ...note, content: scrubTagsFromContent(note.content, note.tags) }));
          setNotes(cleaned);
          const wanted = res?.tacticalNotesActive?.id;
          setActiveNoteId(cleaned.some((n) => n.id === wanted) ? wanted : cleaned[0].id);
          if (cleaned.some((n, i) => n.content !== stored[i].content)) {
            chrome.storage.local.set({ tacticalNotes: cleaned, tacticalNotesMeta: { writer: INSTANCE_ID, at: Date.now() } });
          }
        } else {
          const initNote: NoteItem = {
            id: 'note_' + Date.now(),
            title: 'Tactical Quick Note',
            content: 'Researching API pricing models and enterprise tiers.',
            tags: ['ideas', 'pricing', 'architecture'],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          setNotes([initNote]);
          setActiveNoteId(initNote.id);
          chrome.storage.local.set({
            tacticalNotes: [initNote],
            tacticalNotesMeta: { writer: INSTANCE_ID, at: Date.now() },
            tacticalNotesActive: { id: initNote.id, writer: INSTANCE_ID },
          });
        }
      });
    } catch {}
  }, []);

  // Keep this tab in step with edits and note switches made in other tabs.
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== 'local') return;
      const meta = changes.tacticalNotesMeta?.newValue;
      if (changes.tacticalNotes && !(meta && meta.writer === INSTANCE_ID)) {
        const next: NoteItem[] = Array.isArray(changes.tacticalNotes.newValue) ? changes.tacticalNotes.newValue : [];
        setNotes(next);
        setActiveNoteId((prev) => (prev && next.some((n) => n.id === prev) ? prev : next[0]?.id ?? null));
      }
      const active = changes.tacticalNotesActive?.newValue;
      if (active && active.writer !== INSTANCE_ID) {
        setActiveNoteId(active.id ?? null);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);

    document.body.style.userSelect = 'none';

    const minW = 280;
    const maxW = Math.max(minW, Math.floor(window.innerWidth * 0.75));

    const onMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const calculated = window.innerWidth - moveEvent.clientX;
      const clamped = Math.max(minW, Math.min(maxW, calculated));

      currentDrawerWidth = clamped;
      setDrawerWidth(clamped);

      if (drawerContainer) {
        drawerContainer.style.setProperty('width', `${clamped}px`, 'important');
      }
    };

    const onMouseUp = () => {
      setIsDragging(false);
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ drawerWidth: currentDrawerWidth });
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const saveNotes = (updated: NoteItem[], selectId?: string | null) => {
    setNotes(updated);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const payload: Record<string, unknown> = {
        tacticalNotes: updated,
        tacticalNotesMeta: { writer: INSTANCE_ID, at: Date.now() },
      };
      if (selectId !== undefined) payload.tacticalNotesActive = { id: selectId, writer: INSTANCE_ID };
      chrome.storage.local.set(payload);
    }
    // Delegate network sync to Extension Service Worker to prevent Private Network Access (PNA) webpage prompts
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage({ type: 'SYNC_NOTES_TO_BRIDGE', notes: updated });
      } catch {}
    }
  };

  const selectNote = (id: string | null) => {
    setActiveNoteId(id);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ tacticalNotesActive: { id, writer: INSTANCE_ID } });
    }
  };

  const handleCreateNote = () => {
    const newNote: NoteItem = {
      id: 'note_' + Date.now(),
      title: '',
      content: '',
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = [newNote, ...notes];
    setActiveNoteId(newNote.id);
    saveNotes(updated, newNote.id);
  };

  const handleDeleteNote = (id: string) => {
    const updated = notes.filter((n) => n.id !== id);
    if (activeNoteId === id) {
      const nextId = updated.length > 0 ? updated[0].id : null;
      setActiveNoteId(nextId);
      saveNotes(updated, nextId);
    } else {
      saveNotes(updated);
    }
  };

  const activeNote = notes.find((n) => n.id === activeNoteId);

  const handleUpdateActiveNote = (title: string, content: string, customTags?: string[]) => {
    if (!activeNoteId) return;

    // Explicit tag array passed in or retain activeNote tags cleanly
    const updatedTags = customTags !== undefined ? customTags : (activeNote?.tags || []);
    const cleanContent = scrubTagsFromContent(content, updatedTags);

    const updated = notes.map((n) => {
      if (n.id === activeNoteId) {
        return {
          ...n,
          title,
          content: cleanContent,
          tags: updatedTags,
          updatedAt: new Date().toISOString(),
        };
      }
      return n;
    });
    saveNotes(updated);
  };

  const handleAddTag = (rawTag: string) => {
    if (!rawTag || !activeNote) return;
    const cleanTag = rawTag.trim().toLowerCase().replace(/^#/, '');
    if (!cleanTag) return;

    if (!activeNote.tags.includes(cleanTag)) {
      const updatedTags = [...activeNote.tags, cleanTag];
      // Ensure the content is kept clean without appending or pasting #tag
      const cleanContent = scrubTagsFromContent(activeNote.content, updatedTags);
      handleUpdateActiveNote(activeNote.title, cleanContent, updatedTags);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    if (!activeNote) return;
    const updatedTags = activeNote.tags.filter((t) => t !== tagToRemove);
    handleUpdateActiveNote(activeNote.title, activeNote.content, updatedTags);
  };

  const handleExportToTask = () => {
    if (!activeNote) return;

    const titleText = activeNote.title.trim() || 'Tactical Note';
    const taskPayload = {
      id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: titleText,
      description: activeNote.content,
      estimatedMinutes: 30,
      priority: 'high',
      status: 'backlog',
      tags: activeNote.tags.length > 0 ? activeNote.tags : ['note-export'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 1. Immediately save to Chrome local storage as primary source
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['tacticalTasks'], (res) => {
        const existing = Array.isArray(res?.tacticalTasks) ? res.tacticalTasks : [];
        chrome.storage.local.set({ tacticalTasks: [taskPayload, ...existing] });
      });
    }

    // 2. Trigger instant UI response for user
    setExportSuccess(true);
    setStatusLog(`[SUCCESS] Created task: "${titleText}"`);
    setTimeout(() => {
      setExportSuccess(false);
      setStatusLog(null);
    }, 2500);

    // 3. Dispatch to service worker to sync over bridge if online
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage({ type: 'CREATE_TASK_IN_BRIDGE', taskPayload }, () => {
          if (chrome.runtime.lastError) {
            // Ignore runtime disconnect error silently
          }
        });
      } catch {}
    }
  };

  // Combine user created tags with preset tags for the filter bar
  const userTags = notes.flatMap((n) => n.tags);
  const filterTags = Array.from(new Set([...PRESET_TAGS, ...userTags]));

  const filteredNotes = notes.filter((n) => {
    const matchesSearch =
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTag = selectedTag ? n.tags.includes(selectedTag) : true;
    return matchesSearch && matchesTag;
  });

  return (
    <>
    <button
      className={`minimized-tab ${mode === 'minimized' ? 'visible' : ''}`}
      onClick={onExpand}
      title="Show notes (Alt+N)"
      tabIndex={mode === 'minimized' ? 0 : -1}
    >
      <FileText style={{ width: '13px', height: '13px' }} />
      <span className="tab-label">NOTES</span>
    </button>
    <div className={`drawer-wrapper ${isOpen ? 'open' : ''}`}>
      {/* Resizer Handle Bar */}
      <div
        className={`resize-handle ${isDragging ? 'dragging' : ''}`}
        onMouseDown={handleMouseDown}
        title="Click and drag left/right to adjust sidebar width"
      >
        <div className="resize-bar"></div>
      </div>

      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b', background: '#090d16', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText style={{ width: '14px', height: '14px', color: '#10b981' }} />
          <span style={{ fontWeight: 800, color: '#f8fafc', letterSpacing: '0.05em' }}>[TACTICAL_NOTES]</span>
          <span style={{ fontSize: '9px', color: '#64748b', background: '#020617', padding: '2px 6px', border: '1px solid #1e293b', borderRadius: '3px' }}>
            {drawerWidth}px
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button className="drawer-icon-btn" onClick={onMinimize} title="Minimize to the side (stays on every tab)">
            <ChevronsRight style={{ width: '15px', height: '15px' }} />
          </button>
          <button className="drawer-icon-btn" onClick={onClose} title="Close on all tabs (Alt+N brings it back)">
            <X style={{ width: '14px', height: '14px' }} />
          </button>
        </div>
      </div>

      {/* Search & New Control Bar */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e293b', background: '#020617', display: 'flex', gap: '6px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search style={{ width: '12px', height: '12px', color: '#64748b', position: 'absolute', left: '8px', top: '7px' }} />
          <input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '4px 8px 4px 24px', background: '#090d16', border: '1px solid #1e293b', borderRadius: '4px', color: '#f8fafc', outline: 'none' }}
          />
        </div>

        <button
          onClick={handleCreateNote}
          style={{ background: '#10b981', border: 'none', color: '#030712', fontWeight: 800, padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <Plus style={{ width: '12px', height: '12px' }} /> NEW
        </button>
      </div>

      {/* Global Filter Bar (Preset + Custom Tags) */}
      <div
        className="tag-filter-bar"
        style={{ padding: '6px 12px', borderBottom: '1px solid #1e293b', background: '#090d16', display: 'flex', gap: '4px', overflowX: 'auto', alignItems: 'center' }}
      >
        <span style={{ fontSize: '9px', color: '#475569', fontWeight: 700, marginRight: '2px' }}>FILTER:</span>
        <button
          onClick={() => setSelectedTag(null)}
          style={{
            padding: '2px 8px',
            borderRadius: '3px',
            border: '1px solid #1e293b',
            background: selectedTag === null ? '#1e293b' : '#030712',
            color: selectedTag === null ? '#f8fafc' : '#64748b',
            cursor: 'pointer',
            fontSize: '9px',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          ALL
        </button>
        {filterTags.map((tag) => (
          <button
            key={tag}
            onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
            style={{
              padding: '2px 8px',
              borderRadius: '3px',
              border: '1px solid #1e293b',
              background: selectedTag === tag ? '#065f46' : '#030712',
              color: selectedTag === tag ? '#34d399' : '#64748b',
              cursor: 'pointer',
              fontSize: '9px',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            #{tag}
          </button>
        ))}
      </div>

      {/* Main Drawer Grid (List + Editor) */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Note List Sidebar */}
        <div style={{ width: '130px', borderRight: '1px solid #1e293b', background: '#020617', overflowY: 'auto' }}>
          {filteredNotes.length === 0 ? (
            <div style={{ padding: '16px 8px', color: '#64748b', textAlign: 'center', fontSize: '10px' }}>No Notes</div>
          ) : (
            filteredNotes.map((note) => (
              <div
                key={note.id}
                onClick={() => selectNote(note.id)}
                style={{
                  padding: '8px 10px',
                  borderBottom: '1px solid #1e293b',
                  cursor: 'pointer',
                  background: activeNoteId === note.id ? '#090d16' : 'transparent',
                  borderLeft: activeNoteId === note.id ? '2px solid #10b981' : '2px solid transparent',
                }}
              >
                <div style={{ fontWeight: 700, color: activeNoteId === note.id ? '#f8fafc' : '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {note.title.trim() || 'Untitled'}
                </div>
                <div style={{ color: '#475569', fontSize: '9px', marginTop: '2px' }}>
                  {new Date(note.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Note Editor Workspace */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#030712', padding: '12px' }}>
          {activeNote ? (
            <>
              {/* Title Field */}
              <input
                type="text"
                placeholder="Note Title..."
                value={activeNote.title}
                onChange={(e) => handleUpdateActiveNote(e.target.value, activeNote.content)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid #1e293b',
                  padding: '4px 0 8px 0',
                  color: '#f8fafc',
                  fontWeight: 800,
                  fontSize: '12px',
                  outline: 'none',
                  marginBottom: '8px',
                }}
              />

              {/* Tag Management Section */}
              <div style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '6px', borderBottom: '1px solid #111827', paddingBottom: '8px' }}>
                {/* Active Tag Pills + Input + Add Button */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAddTag(tagInput);
                  }}
                  style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}
                >
                  <Tag style={{ width: '11px', height: '11px', color: '#10b981' }} />
                  {activeNote.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        background: '#065f46',
                        color: '#34d399',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        fontSize: '9px',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      #{tag}
                      <X
                        onClick={() => handleRemoveTag(tag)}
                        style={{ width: '10px', height: '10px', cursor: 'pointer', color: '#a7f3d0' }}
                      />
                    </span>
                  ))}
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                    <input
                      type="text"
                      placeholder="+ Tag"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          handleAddTag(tagInput);
                        }
                      }}
                      style={{
                        background: '#090d16',
                        border: '1px solid #1e293b',
                        borderRadius: '3px',
                        padding: '2px 6px',
                        color: '#f8fafc',
                        outline: 'none',
                        width: '70px',
                        fontSize: '9px',
                      }}
                    />
                    <button
                      type="submit"
                      style={{
                        background: '#10b981',
                        border: 'none',
                        color: '#030712',
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '9px',
                      }}
                    >
                      ADD
                    </button>
                  </div>
                </form>

                {/* Preset Suggestions Quick Click */}
                <div
                  className="tag-filter-bar"
                  style={{ display: 'flex', gap: '4px', overflowX: 'auto', alignItems: 'center' }}
                >
                  <span style={{ fontSize: '8px', color: '#475569', fontWeight: 700 }}>PRESETS:</span>
                  {PRESET_TAGS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleAddTag(preset)}
                      disabled={activeNote.tags.includes(preset)}
                      style={{
                        background: activeNote.tags.includes(preset) ? '#090d16' : '#020617',
                        border: '1px solid #1e293b',
                        color: activeNote.tags.includes(preset) ? '#334155' : '#64748b',
                        borderRadius: '2px',
                        padding: '1px 5px',
                        fontSize: '8px',
                        cursor: activeNote.tags.includes(preset) ? 'default' : 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      +{preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content Field */}
              <textarea
                placeholder="Type tactical notes..."
                value={activeNote.content}
                onChange={(e) => handleUpdateActiveNote(activeNote.title, e.target.value)}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  color: '#cbd5e1',
                  outline: 'none',
                  resize: 'none',
                  lineHeight: 1.5,
                  fontSize: '11px',
                }}
              />

              {/* Live Copyable Debug/Error Banner */}
              {statusLog && (
                <div
                  style={{
                    background: '#090d16',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                    padding: '6px 8px',
                    marginBottom: '8px',
                    fontSize: '9px',
                    color: statusLog.includes('ERROR') ? '#f43f5e' : statusLog.includes('SUCCESS') ? '#34d399' : '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    userSelect: 'text',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <AlertCircle style={{ width: '12px', height: '12px', flexShrink: 0 }} />
                    <span style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{statusLog}</span>
                  </div>
                  <button
                    onClick={() => setStatusLog(null)}
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '0 2px' }}
                  >
                    <X style={{ width: '10px', height: '10px' }} />
                  </button>
                </div>
              )}

              {/* Action Toolbar */}
              <div style={{ paddingTop: '8px', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  onClick={() => handleDeleteNote(activeNote.id)}
                  style={{ background: 'none', border: 'none', color: '#f43f5e', cursor: 'pointer', padding: '4px' }}
                  title="Delete Note"
                >
                  <Trash2 style={{ width: '13px', height: '13px' }} />
                </button>

                <button
                  onClick={handleExportToTask}
                  style={{
                    background: exportSuccess ? '#059669' : '#090d16',
                    border: '1px solid #10b981',
                    color: '#10b981',
                    fontWeight: 800,
                    padding: '4px 10px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '9px',
                  }}
                >
                  {exportSuccess ? <CheckCircle2 style={{ width: '11px', height: '11px' }} /> : <Zap style={{ width: '11px', height: '11px' }} />}
                  {exportSuccess ? 'TASK_CREATED' : 'EXPORT_TO_TASK'}
                </button>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#475569' }}>
              Select or create a note
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
};
