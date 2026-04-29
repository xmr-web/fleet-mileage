import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main:        resolve(__dirname, 'index.html'),
        faultReport: resolve(__dirname, 'fault-report.html'),
        knownIssues: resolve(__dirname, 'known-issues.html'),
        admin:       resolve(__dirname, 'admin/index.html'),
        login:       resolve(__dirname, 'admin/login.html'),
      },
    },
  },
});
