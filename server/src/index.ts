import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(',').map(value => value.trim()).filter(Boolean));
const app = createApp(allowedOrigins);
try {
  await app.listen({ port, host });
  app.log.info(`El Sembrador server listening on ${host}:${port}`);
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
