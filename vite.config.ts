import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'
import dotenv from 'dotenv'

// Load .env so email credentials are available during the build
dotenv.config()

const emailDefines = {
  __EMAIL_USER__: JSON.stringify(process.env.EMAIL_USER ?? ''),
  __EMAIL_PASS__: JSON.stringify(process.env.EMAIL_PASS ?? ''),
  __EMAIL_FROM__: JSON.stringify(process.env.EMAIL_FROM ?? process.env.EMAIL_USER ?? ''),
}

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart(args) { args.startup() },
        vite: {
          define: emailDefines,
          build: {
            outDir: 'dist-electron',
            sourcemap: true,
            rollupOptions: {
              external: ['googleapis', 'electron-updater', 'electron', 'fs', 'path', 'os', 'net', 'tls', 'https', 'http', 'stream', 'crypto', 'electron-store', 'conf'],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) { args.reload() },
        vite: { build: { outDir: 'dist-electron', sourcemap: true } },
      },
    ]),
    renderer(),
  ],
  base: './',
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  server: { port: 5173 },
})
