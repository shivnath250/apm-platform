import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: '/apm-platform/' keeps asset paths relative so it works both locally and on
// GitHub Pages (which serves from /<repo-name>/).
export default defineConfig({
  base: '/apm-platform/',
  plugins: [react()],
})
