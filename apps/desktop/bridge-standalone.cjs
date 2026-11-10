const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Session state survives bridge restarts so a running session (or an un-acknowledged
// "finish" submitted from the extension) is never silently lost.
const PORT = Number(process.env.FOCUSWATCH_BRIDGE_PORT) || 47777;
const STATE_FILE = process.env.FOCUSWATCH_STATE_FILE || path.join(__dirname, 'bridge-state.json');
const ARTIFACT_DIR = process.env.FOCUSWATCH_ARTIFACT_DIR || path.join(__dirname, 'bridge-artifacts');
const MAX_PENDING_ARTIFACTS = 30;
const MAX_ARTIFACT_BODY_BYTES = 25 * 1024 * 1024;

let activeSessionState = {
  active: false,
  rules_version: Date.now(),
  task: 'Deep Work Focus Session',
  started_at: null,
  planned_minutes: 25,
  strictness_mode: 'standard',
  blocked_domains: [
    'youtube.com',
    'instagram.com',
    'reddit.com',
    'x.com',
    'facebook.com',
    'linkedin.com',
  ],
  allowed_exceptions: [
    'music.youtube.com',
    'studio.youtube.com',
  ],
};

let storedTasks = [];
let storedNotes = [];

// Set when the extension (or anything else) finishes a session. The desktop app
// consumes it, records the result in its own database, then acknowledges it.
let pendingFinish = null;

// Proof screenshots captured by the extension, waiting for the desktop to collect them.
let pendingArtifacts = [];

try {
  const persisted = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  if (persisted && persisted.activeSessionState) {
    activeSessionState = { ...activeSessionState, ...persisted.activeSessionState };
  }
  if (persisted && persisted.pendingFinish) pendingFinish = persisted.pendingFinish;
  if (persisted && Array.isArray(persisted.pendingArtifacts)) pendingArtifacts = persisted.pendingArtifacts;
} catch {}

function persistState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ activeSessionState, pendingFinish, pendingArtifacts }));
  } catch {}
}

function readJsonBody(req, cb) {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    let parsed = {};
    try { parsed = body ? JSON.parse(body) : {}; } catch { return cb(new Error('Invalid JSON')); }
    cb(null, parsed);
  });
}

function pauseSnapshot() {
  return {
    paused: Boolean(activeSessionState.paused),
    paused_at: activeSessionState.paused_at || null,
    total_paused_ms: activeSessionState.total_paused_ms || 0,
    pause_updated_at: activeSessionState.pause_updated_at || null,
  };
}

function clearPauseState() {
  activeSessionState = {
    ...activeSessionState,
    paused: false,
    paused_at: null,
    total_paused_ms: 0,
    pause_updated_at: null,
  };
}

// Total paused time right now, folding in a pause that is still open.
function totalPausedNow() {
  const base = activeSessionState.total_paused_ms || 0;
  if (activeSessionState.paused && activeSessionState.paused_at) {
    return base + Math.max(0, Date.now() - Date.parse(activeSessionState.paused_at));
  }
  return base;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url || '';

  if (req.method === 'GET' && url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', bridge_port: 47777, version: '0.1.0' }));
    return;
  }

  if (req.method === 'GET' && url === '/session/active') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(activeSessionState));
    return;
  }

  if (req.method === 'POST' && url === '/session/active') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const incoming = JSON.parse(body);

        // The desktop re-posts "active" every few seconds. If this session was already
        // finished from the extension, do not let a stale post bring it back to life.
        if (pendingFinish && incoming.active && incoming.started_at === pendingFinish.started_at) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ignored', finish_pending: true }));
          return;
        }

        // Pause state: the desktop and the extension can both change it, so the newest
        // change (by pause_updated_at) wins. A new session or an idle post resets it.
        const isNewSession = incoming.started_at && incoming.started_at !== activeSessionState.started_at;
        const incomingStamp = incoming.pause_updated_at ? Date.parse(incoming.pause_updated_at) : 0;
        const currentStamp = activeSessionState.pause_updated_at ? Date.parse(activeSessionState.pause_updated_at) : 0;
        let pauseFields = null;
        if (!incoming.active) {
          pauseFields = { paused: false, paused_at: null, total_paused_ms: 0, pause_updated_at: null };
        } else if (isNewSession || incomingStamp > currentStamp) {
          pauseFields = {
            paused: Boolean(incoming.paused),
            paused_at: incoming.paused ? incoming.paused_at || null : null,
            total_paused_ms: Number(incoming.total_paused_ms) || 0,
            pause_updated_at: incoming.pause_updated_at || null,
          };
        }

        activeSessionState = {
          ...activeSessionState,
          ...(pauseFields || {}),
          active: Boolean(incoming.active),
          session_id: incoming.session_id !== undefined ? incoming.session_id : activeSessionState.session_id,
          task_id: incoming.task_id !== undefined ? incoming.task_id : activeSessionState.task_id,
          expected_output: incoming.expected_output !== undefined ? incoming.expected_output : activeSessionState.expected_output,
          category_id: incoming.category_id !== undefined ? incoming.category_id : activeSessionState.category_id,
          block_websites: incoming.block_websites !== undefined ? incoming.block_websites : activeSessionState.block_websites,
          rules_version: incoming.rules_version || Date.now(),
          task: incoming.task || activeSessionState.task,
          started_at: incoming.started_at !== undefined ? incoming.started_at : activeSessionState.started_at,
          planned_minutes: incoming.planned_minutes || activeSessionState.planned_minutes,
          strictness_mode: incoming.strictness_mode || activeSessionState.strictness_mode,
          blocked_domains: Array.isArray(incoming.blocked_domains)
            ? incoming.blocked_domains
            : activeSessionState.blocked_domains,
          allowed_exceptions: Array.isArray(incoming.allowed_exceptions)
            ? incoming.allowed_exceptions
            : activeSessionState.allowed_exceptions,
        };
        persistState();
        console.log('[Standalone Bridge 47777] State updated:', activeSessionState.task, 'Active:', activeSessionState.active);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // POST /session/pause - freeze the running session (timer stops, blocking lifts)
  if (req.method === 'POST' && url === '/session/pause') {
    readJsonBody(req, (err, incoming) => {
      if (err) return sendJson(res, 400, { error: 'Invalid JSON' });
      if (!activeSessionState.active) return sendJson(res, 409, { error: 'No active session' });
      if (incoming.started_at && incoming.started_at !== activeSessionState.started_at) {
        return sendJson(res, 409, { error: 'Active session changed, refresh and retry' });
      }
      if (!activeSessionState.paused) {
        const now = new Date().toISOString();
        activeSessionState = {
          ...activeSessionState,
          paused: true,
          paused_at: now,
          pause_updated_at: now,
          rules_version: Date.now(),
        };
        persistState();
        console.log('[Standalone Bridge 47777] Session paused');
      }
      sendJson(res, 200, { status: 'ok', ...pauseSnapshot() });
    });
    return;
  }

  // POST /session/resume - continue a paused session
  if (req.method === 'POST' && url === '/session/resume') {
    readJsonBody(req, (err, incoming) => {
      if (err) return sendJson(res, 400, { error: 'Invalid JSON' });
      if (!activeSessionState.active) return sendJson(res, 409, { error: 'No active session' });
      if (incoming.started_at && incoming.started_at !== activeSessionState.started_at) {
        return sendJson(res, 409, { error: 'Active session changed, refresh and retry' });
      }
      if (activeSessionState.paused) {
        activeSessionState = {
          ...activeSessionState,
          total_paused_ms: totalPausedNow(),
          paused: false,
          paused_at: null,
          pause_updated_at: new Date().toISOString(),
          rules_version: Date.now(),
        };
        persistState();
        console.log('[Standalone Bridge 47777] Session resumed');
      }
      sendJson(res, 200, { status: 'ok', ...pauseSnapshot() });
    });
    return;
  }

  // POST /session/artifact - proof screenshot from the extension, kept until the desktop collects it
  if (req.method === 'POST' && url === '/session/artifact') {
    const chunks = [];
    let size = 0;
    let rejected = false;
    req.on('data', (chunk) => {
      if (rejected) return;
      size += chunk.length;
      if (size > MAX_ARTIFACT_BODY_BYTES) {
        rejected = true;
        sendJson(res, 413, { error: 'Image too large' });
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (rejected) return;
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const m = /^data:(image\/(png|jpeg|webp|gif));base64,(.+)$/i.exec(body.imageDataUrl || '');
        if (!m) return sendJson(res, 400, { error: 'imageDataUrl must be a base64 image data URL' });

        const ext = m[2].toLowerCase() === 'jpeg' ? 'jpg' : m[2].toLowerCase();
        const id = 'art_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
        fs.writeFileSync(path.join(ARTIFACT_DIR, id + '.' + ext), Buffer.from(m[3], 'base64'));

        pendingArtifacts.push({
          id,
          file: id + '.' + ext,
          type: m[1].toLowerCase(),
          title: String(body.title || '').slice(0, 300),
          url: String(body.url || '').slice(0, 1000),
          timestamp: body.timestamp || new Date().toISOString(),
          session_started_at: body.session_started_at || activeSessionState.started_at || null,
        });
        while (pendingArtifacts.length > MAX_PENDING_ARTIFACTS) {
          const dropped = pendingArtifacts.shift();
          try { fs.unlinkSync(path.join(ARTIFACT_DIR, dropped.file)); } catch {}
        }
        persistState();
        sendJson(res, 200, { recorded: true, id });
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON' });
      }
    });
    return;
  }

  // GET /session/artifacts - list proof screenshots waiting to be collected
  if (req.method === 'GET' && url === '/session/artifacts') {
    sendJson(res, 200, { artifacts: pendingArtifacts });
    return;
  }

  // GET /artifacts/<id> - the image bytes
  if (req.method === 'GET' && url.startsWith('/artifacts/')) {
    const id = decodeURIComponent(url.slice('/artifacts/'.length));
    const entry = pendingArtifacts.find((a) => a.id === id);
    if (!entry) return sendJson(res, 404, { error: 'Not Found' });
    try {
      const bytes = fs.readFileSync(path.join(ARTIFACT_DIR, entry.file));
      res.writeHead(200, { 'Content-Type': entry.type, 'Cache-Control': 'no-store' });
      res.end(bytes);
    } catch {
      sendJson(res, 404, { error: 'File missing' });
    }
    return;
  }

  // POST /session/artifacts/ack - desktop has stored the image, delete our copy
  if (req.method === 'POST' && url === '/session/artifacts/ack') {
    readJsonBody(req, (err, incoming) => {
      if (err) return sendJson(res, 400, { error: 'Invalid JSON' });
      const entry = pendingArtifacts.find((a) => a.id === incoming.id);
      if (entry) {
        pendingArtifacts = pendingArtifacts.filter((a) => a.id !== incoming.id);
        try { fs.unlinkSync(path.join(ARTIFACT_DIR, entry.file)); } catch {}
        persistState();
      }
      sendJson(res, 200, { status: 'ok' });
    });
    return;
  }

  // GET /session/finish - desktop polls this for a result submitted from the extension
  if (req.method === 'GET' && url === '/session/finish') {
    sendJson(res, 200, { pending: pendingFinish });
    return;
  }

  // POST /session/finish - extension submits "I'm done" with an outcome
  if (req.method === 'POST' && url === '/session/finish') {
    readJsonBody(req, (err, incoming) => {
      if (err) return sendJson(res, 400, { error: 'Invalid JSON' });

      const outcome = incoming.outcome;
      if (!['yes', 'partial', 'no'].includes(outcome)) {
        return sendJson(res, 400, { error: "outcome must be 'yes', 'partial' or 'no'" });
      }
      if (!activeSessionState.active) {
        // Idempotent: a double click or retry after success is not an error.
        if (pendingFinish) return sendJson(res, 200, { status: 'ok', pending: pendingFinish });
        return sendJson(res, 409, { error: 'No active session' });
      }
      if (incoming.started_at && incoming.started_at !== activeSessionState.started_at) {
        return sendJson(res, 409, { error: 'Active session changed, refresh and retry' });
      }

      pendingFinish = {
        session_id: activeSessionState.session_id || null,
        task_id: activeSessionState.task_id || null,
        task: activeSessionState.task,
        expected_output: activeSessionState.expected_output || null,
        category_id: activeSessionState.category_id || null,
        started_at: activeSessionState.started_at,
        planned_minutes: activeSessionState.planned_minutes,
        strictness_mode: activeSessionState.strictness_mode,
        block_websites: activeSessionState.block_websites,
        total_paused_ms: totalPausedNow(),
        difficulty: [1, 2, 3, 4, 5].includes(Number(incoming.difficulty)) ? Number(incoming.difficulty) : null,
        outcome,
        note: String(incoming.note || '').slice(0, 2000),
        ended_at: new Date().toISOString(),
        source: incoming.source || 'extension',
      };
      // Stop blocking immediately; the desktop records the result whenever it next polls.
      activeSessionState = {
        ...activeSessionState,
        active: false,
        rules_version: Date.now(),
        blocked_domains: activeSessionState.blocked_domains,
      };
      clearPauseState();
      persistState();
      console.log('[Standalone Bridge 47777] Session finished from', pendingFinish.source, '->', outcome);
      sendJson(res, 200, { status: 'ok', pending: pendingFinish });
    });
    return;
  }

  // POST /session/finish/ack - desktop confirms it recorded the result
  if (req.method === 'POST' && url === '/session/finish/ack') {
    readJsonBody(req, (err, incoming) => {
      if (err) return sendJson(res, 400, { error: 'Invalid JSON' });
      if (pendingFinish && (!incoming.started_at || incoming.started_at === pendingFinish.started_at)) {
        pendingFinish = null;
        persistState();
      }
      sendJson(res, 200, { status: 'ok' });
    });
    return;
  }

  // DELETE /tasks or POST /tasks/delete - Delete a task
  if (
    (req.method === 'DELETE' && url.startsWith('/tasks')) ||
    (req.method === 'POST' && url === '/tasks/delete')
  ) {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        let taskId = '';
        const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        taskId = urlObj.searchParams.get('id') || '';

        if (!taskId && body) {
          try {
            const parsed = JSON.parse(body);
            taskId = parsed.id || '';
          } catch {}
        }

        if (taskId) {
          storedTasks = storedTasks.filter((t) => t.id !== taskId);
          console.log('[Standalone Bridge 47777] Task Deleted:', taskId);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', deletedId: taskId }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to delete task' }));
      }
    });
    return;
  }

  // POST /tasks - Create/Save new task from extension or desktop
  if (req.method === 'POST' && url === '/tasks') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const incoming = JSON.parse(body);
        const now = new Date().toISOString();
        const newTask = {
          // Keep every field the sender provided (category, effort, impact, due date, ...)
          // and only fill defaults for the ones that matter to the extension.
          ...incoming,
          id: incoming.id || `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          title: incoming.title || 'Untitled Task',
          description: incoming.description || '',
          expectedOutput: incoming.expectedOutput || '',
          estimatedMinutes: incoming.estimatedMinutes || 30,
          priority: incoming.priority || 'high',
          status: incoming.status || 'backlog',
          tags: Array.isArray(incoming.tags) ? incoming.tags : [],
          subtasks: Array.isArray(incoming.subtasks) ? incoming.subtasks : [],
          createdAt: incoming.createdAt || now,
          updatedAt: incoming.updatedAt || now,
        };

        // Prepend task if new, or update existing
        const existingIdx = storedTasks.findIndex((t) => t.id === newTask.id);
        if (existingIdx >= 0) {
          storedTasks[existingIdx] = newTask;
        } else {
          storedTasks.unshift(newTask);
        }

        console.log('[Standalone Bridge 47777] Task Received:', newTask.title);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', task: newTask }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // GET /notes - Fetch notes stored in bridge
  if (req.method === 'GET' && url === '/notes') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(storedNotes));
    return;
  }

  // POST /notes - Save tactical notes
  if (req.method === 'POST' && url === '/notes') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const incoming = JSON.parse(body);
        if (Array.isArray(incoming.notes)) {
          storedNotes = incoming.notes;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  if (req.method === 'POST' && url === '/attempts') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ recorded: true }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('[Standalone Bridge 47777] Port 47777 is already in use by another process.');
  } else {
    console.error('[Standalone Bridge 47777] Error:', err);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('================================================================');
  console.log('🚀 FocusWatch Standalone Extension Bridge running on 127.0.0.1:' + PORT);
  console.log('================================================================');
});
