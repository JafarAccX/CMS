import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // The LMS embeds this app in an <iframe> (Community screen). The browser only
  // allows that if the framed document is served with a matching
  // `frame-ancestors` directive. FRAME_ANCESTORS is a space/comma-separated
  // list of LMS origins allowed to embed us (defaults to the LMS dev server).
  // NOTE: in production the static host (nginx/Vercel/etc.) must send the same
  // header — these settings only cover the Vite dev server and `vite preview`.
  const frameAncestors = (env.FRAME_ANCESTORS || 'http://localhost:3000')
    .split(/[\s,]+/)
    .filter(Boolean)
    .join(' ')
  const headers = {
    'Content-Security-Policy': `frame-ancestors 'self' ${frameAncestors}`,
  }

  return {
    plugins: [react()],
    server: { port: 5173, headers },
    preview: { headers },
  }
})
