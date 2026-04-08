import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_DEV_PROXY_TARGET || 'http://localhost:5000';
  const customAllowedHosts = String(env.VITE_ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);
  const allowedHosts = customAllowedHosts.length
    ? customAllowedHosts
    : ['localhost', '127.0.0.1', '.ngrok-free.dev'];

  return {
    plugins: [react()],
    server: {
      host: env.VITE_HOST || '0.0.0.0',
      port: Number(env.VITE_PORT || 5173),
      allowedHosts,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/uploads': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
