import { fileURLToPath } from 'node:url';

export interface ServerOptions {
  logger: boolean;
  now: () => number;
  tickIntervalMs: number;
  messageRateLimit: number;
  messageRateWindowMs: number;
  webRoot?: string;
  allowedOrigin?: string;
}

export function productionOptions(): ServerOptions {
  return {
    logger: true,
    now: Date.now,
    tickIntervalMs: 250,
    messageRateLimit: 40,
    messageRateWindowMs: 10_000,
    webRoot: fileURLToPath(new URL('../web/dist', import.meta.url)),
    ...(process.env.PUBLIC_ORIGIN ? { allowedOrigin: process.env.PUBLIC_ORIGIN } : {}),
  };
}
