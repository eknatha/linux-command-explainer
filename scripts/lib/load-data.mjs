// Shared data loader for validate / build / tests.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const LCE = require(path.join(ROOT, 'src', 'engine.js'));

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (ent.name.endsWith('.json')) out.push(p);
  }
  return out;
}

function readJson(file, problems) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { problems.push({ level: 'error', file: path.relative(ROOT, file), msg: 'Invalid JSON: ' + e.message }); return null; }
}

export function loadData(root = ROOT) {
  const problems = [];
  const rel = (f) => path.relative(root, f);
  const categories = readJson(path.join(root, 'data', 'categories.json'), problems) || {};
  const commands = [];
  for (const f of walk(path.join(root, 'data', 'commands'))) {
    const j = readJson(f, problems);
    if (!j) continue;
    if (!j.category || !Array.isArray(j.commands)) { problems.push({ level: 'error', file: rel(f), msg: 'File must look like { "category": "...", "commands": [ ... ] }' }); continue; }
    for (const c of j.commands) commands.push(Object.assign({ category: j.category }, c, { _file: rel(f) }));
  }
  const rules = { rules: [], prod: { signals: [] } };
  for (const f of walk(path.join(root, 'data', 'rules'))) {
    const j = readJson(f, problems);
    if (!j) continue;
    for (const r of j.rules || []) rules.rules.push(Object.assign({}, r, { _file: rel(f) }));
    for (const s of (j.prod && j.prod.signals) || []) rules.prod.signals.push(Object.assign({}, s, { _file: rel(f) }));
  }
  const intents = [];
  for (const f of walk(path.join(root, 'data', 'intents'))) {
    const j = readJson(f, problems);
    if (!j) continue;
    for (const i of j.intents || []) intents.push(Object.assign({}, i, { _file: rel(f) }));
  }
  return { commands, categories, rules, intents, problems };
}

export function stripPrivate(obj) {
  return JSON.parse(JSON.stringify(obj, (k, v) => (k.startsWith('_') ? undefined : v)));
}
