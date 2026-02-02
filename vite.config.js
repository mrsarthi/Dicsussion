import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Base path for Electron - use relative paths for production
  base: './',
  build: {
    // Output directory
    outDir: 'dist',
    // Generate sourcemaps for debugging
    sourcemap: false,
    // Optimize for production
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.logs in production
      },
    },
    // Chunk splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          crypto: ['tweetnacl', 'tweetnacl-util'],
          web3: ['ethers'],
          gun: ['gun'],
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
