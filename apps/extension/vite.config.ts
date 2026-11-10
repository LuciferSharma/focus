import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
        popup: resolve(__dirname, 'popup.html'),
        blocked: resolve(__dirname, 'blocked.html'),
        options: resolve(__dirname, 'options.html'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') {
            return 'src/background/index.js';
          }
          if (chunkInfo.name === 'content') {
            return 'src/content/index.js';
          }
          return 'assets/[name]-[hash].js';
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'content.css' || assetInfo.name === 'index.css') {
            return 'src/content/index.css';
          }
          return 'assets/[name]-[hash].[ext]';
        },
      },
    },
  },
});
