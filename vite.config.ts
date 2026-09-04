import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative base so the bundle works from a project subpath
  // (https://<user>.github.io/writerer/) as well as from the root.
  base: './',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    cors: true,
  },
  preview: { host: '0.0.0.0', port: 5173, allowedHosts: true },
  optimizeDeps: { exclude: ['@mlc-ai/web-llm'] },
})
