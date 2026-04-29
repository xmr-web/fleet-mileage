import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        // Main driver-facing app (your existing entry)
        main: resolve(__dirname, 'index.html'),
        // Admin dashboard
        admin: resolve(__dirname, 'admin/index.html'),
        // Admin login page
        login: resolve(__dirname, 'admin/login.html'),
      },
    },
  },
});
