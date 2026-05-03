import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // pdfjs-dist uses dynamic imports for its worker — exclude so Vite
    // doesn't try to bundle the worker file itself.
    exclude: ['pdfjs-dist'],
  },
  worker: {
    format: 'es',
  },
})
