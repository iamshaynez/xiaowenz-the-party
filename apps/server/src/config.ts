import { fileURLToPath } from 'node:url';

export interface ServerOptions {
  logger: boolean;
  now: () => number;
  tickIntervalMs: number;
  messageRateLimit: number;
  messageRateWindowMs: number;
  webRoot?: string;
  allowedOrigin?: string;
  dataFile?: string;
  trustProxy?: boolean;
}

export function productionOptions(): ServerOptions {
  return {
    logger: true,
    now: Date.now,
    tickIntervalMs: 250,
    messageRateLimit: 40,
    messageRateWindowMs: 10_000,
    webRoot: fileURLToPath(new URL('../../web/dist', import.meta.url)),
    dataFile: process.env.PARTY_DATA_FILE ?? './data/party.json',
    trustProxy: process.env.TRUST_PROXY === 'true',
    ...(process.env.PUBLIC_ORIGIN ? { allowedOrigin: process.env.PUBLIC_ORIGIN } : {}),
  };
}
