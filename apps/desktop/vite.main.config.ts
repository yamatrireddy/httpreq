import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'src/main.ts',
    outDir: 'dist/main',
    emptyOutDir: true,
    rollupOptions: {
      external: ['electron'],
      output: { format: 'es', entryFileNames: 'main.js' },
    },
  },
});
