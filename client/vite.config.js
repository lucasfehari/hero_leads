import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true, // Se 5173 estiver ocupada, joga erro claro em vez de mudar de porta silenciosamente
  }
})

