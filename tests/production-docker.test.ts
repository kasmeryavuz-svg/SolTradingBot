import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('production docker artifacts', () => {
  it('uses a multi-stage non-root Node build', () => {
    const docker = read('Dockerfile');
    expect(docker).toMatch(/FROM node:24[^\n]* AS build/);
    expect(docker).toMatch(/FROM node:24[^\n]* AS runtime/);
    expect(docker).toMatch(/npm ci/);
    expect(docker).toMatch(/npm run build/);
    expect(docker).toMatch(/npm ci --omit=dev|npm ci --omit=dev/);
    expect(docker).toMatch(/USER node/);
    expect(docker).toMatch(/dist\/production\/run\.js/);
    expect(docker).not.toMatch(/\btsx\b/);
    expect(docker).toMatch(/NODE_ENV=production/);
    expect(docker).not.toMatch(/\bEXPOSE\b/);
  });

  it('hardens compose and forces live flags off', () => {
    const compose = read('docker-compose.production.yml');
    expect(compose).toMatch(/read_only:\s*true/);
    expect(compose).toMatch(/cap_drop:/);
    expect(compose).toMatch(/-\s*ALL/);
    expect(compose).toMatch(/no-new-privileges:true/);
    expect(compose).toMatch(/init:\s*true/);
    expect(compose).toMatch(/restart:\s*unless-stopped/);
    expect(compose).toMatch(/TRADING_ENABLED:\s*"false"/);
    expect(compose).toMatch(/LIVE_BROADCAST_ENABLED:\s*"false"/);
    expect(compose).not.toMatch(/^\s*ports:/m);
    expect(compose).not.toMatch(/4314:4314/);
    expect(compose).not.toMatch(/127\.0\.0\.1:4314:/);
    expect(compose).not.toMatch(/0\.0\.0\.0:4314/);
    expect(compose).not.toMatch(/0\.0\.0\.0/);
    expect(compose).not.toMatch(/privileged:\s*true/);
    expect(compose).not.toMatch(/network_mode:\s*host/);
    expect(compose).not.toMatch(/docker\.sock/);
    expect(compose).not.toMatch(/\bpublished:/);
    expect(compose).not.toMatch(/\bcurl\b/);
    expect(compose).not.toMatch(/\bwget\b/);
    expect(compose).toMatch(/127\.0\.0\.1:4314\/healthz/);
    expect(compose).toMatch(
      /fetch\('http:\/\/127\.0\.0\.1:4314\/healthz'\)/,
    );
  });

  it('keeps application health on 127.0.0.1 with no all-interface listen path', () => {
    const productionRoot = join(process.cwd(), 'src/production');
    const production = readdirSync(productionRoot)
      .filter((name) => name.endsWith('.ts'))
      .map((name) => readFileSync(join(productionRoot, name), 'utf8'))
      .join('\n');
    expect(production).toMatch(/export const PROD20_HEALTH_HOST = '127\.0\.0\.1' as const;/);
    expect(production).toMatch(/this\.server\.listen\(this\.port, PROD20_HEALTH_HOST/);
    expect(production).toMatch(/healthHost: PROD20_HEALTH_HOST/);
    expect(production).not.toMatch(/readOptionalEnv\([^)]*PROD20_HEALTH_HOST/);
    expect(production).not.toMatch(/\.listen\([^)]*['"]0\.0\.0\.0['"]/);
    expect(production).not.toMatch(/\.listen\([^)]*['"]::['"]/);
    expect(production).not.toMatch(/\.listen\([^)]*['"]::0['"]/);
  });

  it('keeps secrets out of the Docker build context', () => {
    const ignore = read('.dockerignore');
    expect(ignore).toMatch(/(^|\r?\n)\.env(\r?\n|$)/);
    expect(ignore).toMatch(/\.env\.\*/);
    expect(ignore).toMatch(/!\.env\.production\.example/);
    expect(ignore).toMatch(/(^|\r?\n)data(\r?\n|$)/);
    expect(ignore).toMatch(/\.sqlite/);
    expect(ignore).toMatch(/(^|\r?\n)\.git(\r?\n|$)/);
    expect(ignore).toMatch(/node_modules/);
    const example = read('.env.production.example');
    expect(example).toMatch(/TRADING_ENABLED=false/);
    expect(example).toMatch(/LIVE_BROADCAST_ENABLED=false/);
    expect(example).not.toMatch(/PRIVATE_KEY|MNEMONIC|SEED|SECRET_KEY/i);
  });
});
