import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const bridgePort = Number(process.env.BRIDGE_PORT || '3457');

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/codex-api': {
        target: `http://localhost:${bridgePort}`,
        changeOrigin: true,
        ws: true, // Enable WebSocket proxy
      },
    },
  },
});
