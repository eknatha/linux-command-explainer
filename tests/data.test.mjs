import test from 'node:test';
import assert from 'node:assert/strict';
import { data, engine } from './helpers.mjs';

test('data loads without problems', () => {
  assert.deepEqual(data.problems.filter((p) => p.level === 'error'), []);
});
test('at least 600 commands (topics excluded)', () => {
  const n = engine.entries.filter((e) => e.kind !== 'topic').length;
  assert.ok(n >= 600, `only ${n} commands`);
});
test('every medium/high command has cautions', () => {
  const bad = engine.entries.filter((e) => (e.risk === 'medium' || e.risk === 'high') && !e.cautions.length).map((e) => e.name);
  assert.deepEqual(bad, []);
});
test('every high-risk command warns in its description', () => {
  const bad = engine.entries.filter((e) => e.risk === 'high' && e.cautions.length < 1).map((e) => e.name);
  assert.deepEqual(bad, []);
});
test('suggestions resolve to real entries', () => {
  const missing = [];
  for (const e of engine.entries) for (const s of e.suggestions) { const r = engine.resolveSuggestion(s); if (!r || !r.id) missing.push(`${e.name} -> ${s}`); }
  assert.ok(missing.length <= 60, `unresolved suggestions: ${missing.slice(0, 15).join('; ')}`);
});
test('ids are unique and URL-safe', () => {
  const seen = new Set();
  for (const e of engine.entries) { assert.match(e.id, /^[a-z0-9][a-z0-9._-]*$/, e.id); assert.ok(!seen.has(e.id), 'dup ' + e.id); seen.add(e.id); }
});
