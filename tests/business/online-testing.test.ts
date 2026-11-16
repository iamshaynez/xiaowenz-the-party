import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalTarget = process.env.PARTY_BASE_URL;

type PlaywrightConfig = {
  use?: { baseURL?: string };
  webServer?: unknown;
};

async function loadConfig(target?: string): Promise<PlaywrightConfig> {
  vi.resetModules();
  if (target === undefined) delete process.env.PARTY_BASE_URL;
  else process.env.PARTY_BASE_URL = target;
  return (await import('../../playwright.config')).default as PlaywrightConfig;
}

afterEach(() => {
  if (originalTarget === undefined) delete process.env.PARTY_BASE_URL;
  else process.env.PARTY_BASE_URL = originalTarget;
  vi.resetModules();
});

describe('一个人也能执行线上多人验收', () => {
  it('PARTY_BASE_URL 指向线上时，不启动本地服务', async () => {
    const config = await loadConfig('https://party.xiaowenz.com');
    expect(config.use?.baseURL).toBe('https://party.xiaowenz.com');
    expect(config.webServer).toBeUndefined();
  });

  it('未指定线上地址时，仍启动本地生产服务', async () => {
    const config = await loadConfig();
    expect(config.use?.baseURL).toBe('http://127.0.0.1:4173');
    expect(config.webServer).toBeDefined();
  });

  it('提供固定的一键线上测试命令', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(packageJson.scripts['test:e2e:online']).toBe('PARTY_BASE_URL=https://party.xiaowenz.com playwright test');
  });
});
