import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = env.VITE_API_URL || ''
  const devApiTarget = env.VITE_API_URL || 'http://localhost:3001'
  const port = parseInt(env.VITE_PORT || '', 10) || 5173

  return defineConfig({
    plugins: [
      react(),
      tailwindcss(),
    ],
    define: {
      '__API_URL__': JSON.stringify(apiUrl),
    },
    server: {
      host: true,
      port,
      proxy: {
        '/api': {
          target: devApiTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  })
}
