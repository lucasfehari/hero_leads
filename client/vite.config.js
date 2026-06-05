import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // REQUIRED FOR ELECTRON to load local files via file:// protocol
  server: {
    port: 5173,
    strictPort: true, // Se 5173 estiver ocupada, joga erro claro em vez de mudar de porta silenciosamente
  }
})

