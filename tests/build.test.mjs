import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from '../scripts/lib/load-data.mjs';

test('build produces pages, sitemap and robots', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, stdio: 'pipe' });
  for (const f of ['index.html', '404.html', 'robots.txt', 'sitemap.xml', 'cmd/index.html', 'cmd/rsync/index.html', 'cmd/kubectl-delete/index.html', 'assets/data.js', 'assets/app.js', 'assets/engine.js', 'assets/style.css']) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), 'missing ' + f);
  }
  const sm = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  assert.ok((sm.match(/<loc>/g) || []).length >= 600);
  assert.match(fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8'), /Sitemap:/);
});
test('command pages carry SEO metadata, JSON-LD and risk text', () => {
  const h = fs.readFileSync(path.join(ROOT, 'cmd/rm/index.html'), 'utf8');
  assert.match(h, /<link rel="canonical" href="https:\/\/[^"]+\/cmd\/rm\/"/);
  assert.match(h, /application\/ld\+json/);
  assert.match(h, /FAQPage/);
  assert.match(h, /risk/i);
  assert.match(h, /cautions/i);
});
test('every command page links back with relative assets', () => {
  const h = fs.readFileSync(path.join(ROOT, 'cmd/git-push/index.html'), 'utf8');
  assert.match(h, /href="\.\.\/\.\.\/assets\/style\.css/);
});
test('index page is self-contained for offline use', () => {
  const h = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(h, /assets\/data\.js/);
  assert.doesNotMatch(h, /\{\{[A-Z]+\}\}/, 'unreplaced template tokens');
});
