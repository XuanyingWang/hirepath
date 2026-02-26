import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: mode === 'web' ? 'es2020' : 'chrome105',
    outDir: mode === 'web' ? 'dist-web' : 'dist',
    minify: false,
    sourcemap: true,
  },
}))
