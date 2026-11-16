import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('合并 main 即部署的生产契约', () => {
  it('部署只由 main 或人工触发，在 hk-build 串行构建并保留 SHA 回滚镜像', () => {
    const workflow = parse(read('.github/workflows/deploy-main.yml'));
    expect(workflow.on.push.branches).toEqual(['main']);
    expect(workflow.on).toHaveProperty('workflow_dispatch');
    expect(workflow.concurrency['cancel-in-progress']).toBe(false);
    expect(workflow.jobs['build-deploy']['runs-on']).toEqual(['self-hosted', 'hk-build']);

    const text = read('.github/workflows/deploy-main.yml');
    expect(text).toContain('provenance: false');
    expect(text).toContain('sbom: false');
    expect(text).toContain('/xiaowenz/the-party:${{ github.sha }}');
    expect(text).toContain('/xiaowenz/the-party:main');
    expect(text).toContain('deploy/hk-dev/deploy.sh');
    expect(text).toContain('scripts/smoke-public.mjs https://party.xiaowenz.com');
    expect(text).toContain('run: node scripts/smoke-public.mjs https://party.xiaowenz.com');
    expect(read('scripts/smoke-public.mjs')).toContain("from 'node:http'");
  });

  it('生产容器仅暴露回环端口，使用固定公网源和受保护快照目录', () => {
    const compose = parse(read('deploy/hk-dev/docker-compose.yml'));
    const service = compose.services.party;
    expect(service.image).toBe('${ACR_REGISTRY}/xiaowenz/the-party:${PARTY_TAG:-main}');
    expect(service.ports).toEqual(['127.0.0.1:18093:3000']);
    expect(service.volumes).toEqual(['./data:/data']);
    expect(service.environment).toMatchObject({
      PORT: '3000',
      HOST: '0.0.0.0',
      PUBLIC_ORIGIN: 'https://party.xiaowenz.com',
      TRUST_PROXY: 'true',
      PARTY_DATA_FILE: '/data/party.json',
    });
    expect(compose.networks.default.name).toBe('apps');
    expect(compose.networks.default.external).toBe(true);
  });

  it('OpenResty 复用 Cloudflare 回源 HTTP，并完整转发 WebSocket 请求头', () => {
    const vhost = read('deploy/hk-dev/openresty-party.conf');
    expect(vhost).toContain('server_name party.xiaowenz.com;');
    expect(vhost).toContain('listen 80;');
    expect(vhost).not.toContain('listen 443');
    expect(vhost).not.toContain('ssl_certificate');
    expect(vhost).toContain('resolver 127.0.0.11 valid=5s;');
    expect(vhost).toContain('set $party_backend http://party:3000;');
    expect(vhost).toContain('proxy_pass $party_backend;');
    expect(vhost).toContain('proxy_set_header Upgrade $http_upgrade;');
    expect(vhost).toContain('proxy_set_header Connection $connection_upgrade;');
    expect(vhost).toContain('proxy_set_header X-Forwarded-Proto $scheme;');
  });

  it('部署脚本包含拉取重试和真实健康检查，不做固定 sleep 式假成功', () => {
    const script = read('deploy/hk-dev/deploy.sh');
    expect(script).toContain('docker compose pull');
    expect(script).toContain('docker compose up -d');
    expect(script).toContain('http://127.0.0.1:18093/api/health');
    expect(script).toContain('docker logs party --tail');
    expect(script).toContain('exit 1');
  });
});
