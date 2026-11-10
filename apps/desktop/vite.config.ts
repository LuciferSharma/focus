import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import http from 'node:http';

const host = process.env.TAURI_DEV_HOST;

let activeSessionState = {
  active: false,
  rules_version: Date.now(),
  task: 'Deep Work Session',
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

function bridgeServerPlugin() {
  return {
    name: 'focuswatch-bridge-server',
    configureServer() {
      const server = http.createServer((req, res) => {
        // Enable CORS for Chrome Extension & Web Client
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const incoming = JSON.parse(body);
              activeSessionState = {
                ...activeSessionState,
                active: Boolean(incoming.active),
                rules_version: incoming.rules_version || Date.now(),
                task: incoming.task || activeSessionState.task,
                blocked_domains: Array.isArray(incoming.blocked_domains)
                  ? incoming.blocked_domains
                  : activeSessionState.blocked_domains,
                allowed_exceptions: Array.isArray(incoming.allowed_exceptions)
                  ? incoming.allowed_exceptions
                  : activeSessionState.allowed_exceptions,
              };
              console.log('[Bridge Server 47777] Updated active session state:', activeSessionState);
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

      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.log('[Bridge Server 47777] Port 47777 already in use (Rust backend running). Deferring to existing server.');
        } else {
          console.error('[Bridge Server 47777] Server error:', err);
        }
      });

      server.listen(47777, '127.0.0.1', () => {
        console.log('[Bridge Server 47777] 🚀 FocusWatch Extension Bridge listening on http://127.0.0.1:47777');
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), bridgeServerPlugin()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    proxy: {
      '/aw-api': {
        target: 'http://127.0.0.1:5600',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/aw-api/, ''),
      },
    },
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
}));
