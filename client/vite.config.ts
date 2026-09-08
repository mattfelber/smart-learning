import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { qrcode } from 'vite-plugin-qrcode';
import { fileURLToPath } from 'node:url';

const sharedSrc = fileURLToPath(new URL('../shared/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react(), qrcode()],

  resolve: {
    alias: {
      // Compile shared from TypeScript source rather than its CommonJS dist.
      //
      // Pre-bundling the built package looked equivalent but was not: Vite keys
      // the optimizeDeps cache on the dependency list, not on the contents of a
      // linked workspace package. Rebuilding shared/dist therefore never
      // invalidated the cache, and the browser kept running a frozen snapshot
      // whose newer exports were simply missing at runtime.
      //
      // Reading the source removes the built artefact from the browser path
      // entirely, so shared changes hot-reload and cannot go stale.
      '@smart-learning/shared': sharedSrc
    }
  },

  build: {
    rollupOptions: {
      output: {
        // Keep the heavy prose/math/syntax vendors in their own long-lived chunks.
        manualChunks: {
          react: ['react', 'react-dom'],
          katex: ['katex'],
          highlight: ['rehype-highlight'],
          markdown: ['react-markdown', 'remark-gfm', 'remark-math', 'rehype-katex']
        }
      }
    }
  },

  server: {
    // LAN access so the QR code the qrcode plugin prints is scannable from a phone.
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});
