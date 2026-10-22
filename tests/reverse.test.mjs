import test from 'node:test';
import assert from 'node:assert/strict';
import { engine } from './helpers.mjs';

const CASES = [
  ['find files larger than 500MB', 'find-big-files'],
  ['show what is using port 8080', 'port-usage'],
  ['delete log files older than 30 days in /var/log', 'delete-old-files'],
  ['restart nginx', 'service-restart'],
  ['undo last git commit', 'git-undo-commit'],
  ['restart a pod in kubernetes', 'k8s-restart'],
  ['show top 5 memory processes', 'top-memory'],
  ['how much disk space is left', 'disk-free'],
  ['clean up docker', 'docker-clean'],
  ['list failed systemd services', 'failed-services'],
  ['search for the word timeout in /etc', 'find-by-content'],
  ['check ssl certificate expiry of example.com', 'cert-check'],
  ['generate an ssh key', 'ssh-keygen'],
  ['test if port 443 is open on example.com', 'test-port'],
  ['why is my pod crashing', 'k8s-describe'],
  ['preview terraform changes', 'tf-plan'],
];
for (const [q, id] of CASES) {
  test(`describe → ${id}: “${q}”`, () => {
    const r = engine.reverse(q, { limit: 3 });
    assert.ok(r.some((x) => x.id === id), 'got: ' + r.map((x) => x.id).join(', '));
  });
}
test('slots are extracted', () => {
  const r = engine.reverse('find files larger than 500MB', { limit: 1 })[0];
  assert.match(r.cmd, /\+500M/);
  const p = engine.reverse('show what is using port 8080', { limit: 1 })[0];
  assert.match(p.cmd, /8080/);
});
test('every suggested command is risk-analysed', () => {
  for (const r of engine.reverse('delete files older than 30 days', { limit: 3 })) assert.ok(r.analysis && r.analysis.risk);
});
test('delete suggestions are previews, not blind deletes', () => {
  const r = engine.reverse('delete log files older than 30 days in /var/log', { limit: 1 })[0];
  assert.doesNotMatch(r.cmd, /-delete/);
});
test('nonsense yields no result', () => {
  assert.equal(engine.reverse('qwertyuiop asdfghjkl', {}).length, 0);
});
