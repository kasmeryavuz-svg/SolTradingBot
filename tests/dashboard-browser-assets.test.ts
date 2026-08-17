import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dashboardRoot = join(process.cwd(), 'src', 'dashboard');

function listTsFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'public') {
        return [];
      }
      return listTsFiles(path);
    }
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('dashboard browser assets', () => {
  it('does not use dynamic innerHTML and has no trading controls', () => {
    const html = readFileSync(join(dashboardRoot, 'public', 'index.html'), 'utf8');
    const js = readFileSync(join(dashboardRoot, 'public', 'app.js'), 'utf8');
    const css = readFileSync(join(dashboardRoot, 'public', 'styles.css'), 'utf8');
    const combined = `${html}\n${js}\n${css}`;

    expect(js).not.toMatch(/\.innerHTML\s*=/);
    expect(js).not.toMatch(/insertAdjacentHTML/);
    expect(js).not.toMatch(/outerHTML\s*=/);
    expect(js).not.toMatch(/document\.write/);
    expect(js).not.toMatch(/\beval\s*\(/);
    expect(js).not.toMatch(/new Function/);
    expect(js).not.toMatch(/setTimeout\(\s*['"]/);
    expect(js).not.toMatch(/setInterval\(\s*['"]/);
    expect(html).not.toMatch(/<script(?![^>]*src=)/i);
    expect(html).not.toMatch(/\sonclick\s*=/i);
    expect(html).not.toMatch(/\sonload\s*=/i);
    expect(html).not.toMatch(/\sonerror\s*=/i);
    expect(html).not.toMatch(/<style>/i);
    expect(combined).not.toMatch(/cdn\.|googleapis|unpkg|jsdelivr/i);
    expect(combined).not.toMatch(/\bBUY\b/);
    expect(combined).not.toMatch(/\bSELL\b/);
    expect(combined).not.toMatch(/\bEXECUTE\b/);
    expect(combined).not.toMatch(/CONNECT WALLET/i);
    expect(combined).not.toMatch(/START BOT/i);
    expect(combined).not.toMatch(/https:\/\//);
    expect(js).toContain('fetchImpl(API_DASHBOARD');
    expect(js).toContain('fetchImpl(API_HEALTH');
    expect(js).toContain('Latest stored observations');
    expect(js).not.toContain('Live price');
    expect(html).toContain('type="module"');
    expect(html).toContain('href="/styles.css"');
    expect(html).toContain('src="/app.js"');
  });

  it('does not import command execution or trading paths from dashboard TypeScript', () => {
    const files = listTsFiles(dashboardRoot);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/node:child_process|child_process/);
      expect(source).not.toMatch(/\bspawn\s*\(/);
      expect(source).not.toMatch(/\bexecSync\s*\(/);
      expect(source).not.toMatch(/from '\.\.\/solana/);
      expect(source).not.toMatch(/paper\/execute/);
      expect(source).not.toMatch(/position\/step/);
      expect(source).not.toMatch(/exit\/step/);
      expect(source).not.toMatch(/collector\/watch/);
      expect(source).not.toMatch(/market-data\/watch/);
    }
  });
});
