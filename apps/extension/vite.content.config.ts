import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Dedicated build config for Chrome Content Scripts
// Bundles React, Lucide, and all content modules into a self-contained IIFE (no ES module imports)
export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/content/index.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'src/content/index.js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            return 'src/content/index.css';
          }
          return 'assets/[name]-[hash].[ext]';
        },
      },
    },
  },
});
