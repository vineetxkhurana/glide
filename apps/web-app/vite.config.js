import { defineConfig } from 'vite';

// Static HTML + vanilla JS site — no framework plugin needed
export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
