import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // shared is a linked CJS workspace package; Vite must pre-bundle it so its
  // named exports are available to ESM importers.
  optimizeDeps: {
    include: ['@smart-learning/shared']
  },
  build: {
    commonjsOptions: {
      include: [/shared/, /node_modules/]
    },
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
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});
