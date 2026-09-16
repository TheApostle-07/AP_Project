import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser', fullyParallel: true, workers: 2,
  timeout: 30_000, use: { baseURL: 'http://localhost:4308', browserName: 'chromium', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [{ name:'chromium' }, { name:'webkit',use:{browserName:'webkit'} }],
  webServer: { command: 'npm start -- --port 4308', url: 'http://localhost:4308', reuseExistingServer: !process.env.CI, timeout: 30_000 },
});
