import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('react-router-dom')) {
            return 'router'
          }

          if (id.includes('react-dom') || id.includes('/react/')) {
            return 'react-vendor'
          }

          if (id.includes('chart.js') || id.includes('react-chartjs-2')) {
            return 'charts-vendor'
          }

          if (id.includes('axios')) {
            return 'http-vendor'
          }

          if (id.includes('bootstrap')) {
            return 'bootstrap-vendor'
          }

          return 'vendor'
        },
      },
    },
  },
})
