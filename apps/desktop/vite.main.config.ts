import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'src/main.ts',
    outDir: 'dist/main',
    emptyOutDir: true,
    rollupOptions: {
      // ssh2 and ws load optional native bindings through runtime requires, so they are kept
      // as real dependencies and resolved from node_modules instead of being bundled.
      external: ['electron', 'ssh2', 'ws'],
      output: { format: 'es', entryFileNames: 'main.js' },
    },
  },
});
