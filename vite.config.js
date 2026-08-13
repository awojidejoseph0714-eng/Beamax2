import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [
    {
      name: 'rewrite-middleware',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/') {
            res.statusCode = 302;
            res.setHeader('Location', '/app');
            res.end();
            return;
          }
          if (req.url === '/app') req.url = '/index.html';
          if (req.url === '/home') req.url = '/landing.html';
          if (req.url === '/welcome') req.url = '/welcome.html';
          next();
        });
      }
    }
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        landing: resolve(__dirname, 'landing.html'),
        welcome: resolve(__dirname, 'welcome.html')
      }
    }
  }
});
