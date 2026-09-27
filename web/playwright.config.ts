import { defineConfig } from '@playwright/test';

const webOrigin = 'http://127.0.0.1:4173';
const serverPort = 3199;

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: webOrigin },
  webServer: [
    {
      command: `cd ../server && PORT=${serverPort} HOST=127.0.0.1 ALLOWED_ORIGINS=${webOrigin} npm run dev`,
      url: `http://127.0.0.1:${serverPort}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `VITE_WS_URL=ws://127.0.0.1:${serverPort}/ws npm run dev -- --host 127.0.0.1 --port 4173`,
      url: webOrigin,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
