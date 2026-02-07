import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { resolve } from 'path'

import packageJson from './package.json'

// https://vite.dev/config/
export default defineConfig({
  define: {
    '__APP_VERSION__': JSON.stringify(packageJson.version),
  },
  plugins: [
    react(),
    nodePolyfills({
      // To add only specific polyfills, add them here. If no option is passed, adds all.
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
  // Base path for Electron - use relative paths for production
  base: './',
  build: {
    // Output directory
    outDir: 'dist',
    // Generate sourcemaps for debugging
    sourcemap: true,
    // Optimize for production
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // Keep console logs for debugging
      },
    },
    // Chunk splitting for better caching
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        auth: resolve(__dirname, 'public/auth.html'),
      },
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          crypto: ['tweetnacl', 'tweetnacl-util'],
          web3: ['ethers'],
        },
      },
    },
  },
  // Optimize dev server
  server: {
    port: 5173,
    strictPort: true,
  },
})
