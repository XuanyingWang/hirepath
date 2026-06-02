import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
    proxy: {
      '/api/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/anthropic/, ''),
      },
      '/api/voyage': {
        target: 'https://api.voyageai.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/voyage/, ''),
      },
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
