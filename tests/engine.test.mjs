import test from 'node:test';
import assert from 'node:assert/strict';
import { engine } from './helpers.mjs';

const has = (a, id) => a.findings.some((f) => f.id === id);

test('pipes and chains are split into segments', () => {
  const a = engine.analyze("ps aux | grep nginx | awk '{print $2}' | xargs kill -9");
  assert.equal(a.segments.length, 4);
  assert.ok(a.isChain);
  assert.ok(['high', 'critical'].includes(a.risk));
});
test('quoted operators do not split commands', () => {
  const a = engine.analyze('echo "a | b && c"');
  assert.equal(a.segments.length, 1);
});
test('inner commands are analysed (bash -c, ssh, sudo)', () => {
  const a = engine.analyze('ssh prod-1 "rm -rf /var/lib/app/*"');
  assert.ok(a.findings.length > 0);
  assert.ok(['high', 'critical'].includes(a.risk));
});
test('rm -rf / is critical with a safer alternative', () => {
  const a = engine.analyze('rm -rf /');
  assert.equal(a.risk, 'critical');
});
test('derived safer version keeps the user’s own arguments', () => {
  const a = engine.analyze('kubectl delete pod web-1 -n staging');
  assert.ok(a.safer.some((s) => /dry-run/.test(s.cmd) && s.cmd.includes('web-1')), JSON.stringify(a.safer));
});
test('production context raises the risk level', () => {
  const dev = engine.analyze('kubectl delete pod web-1 -n staging');
  const prod = engine.analyze('kubectl delete pod web-1 -n production');
  assert.ok(prod.prod.detected);
  const order = ['low', 'medium', 'high', 'critical'];
  assert.ok(order.indexOf(prod.risk) > order.indexOf(dev.risk));
  assert.ok(prod.riskBumped);
});
test('force push to main is critical', () => {
  const a = engine.analyze('git push --force origin main');
  assert.equal(a.risk, 'critical');
});
test('curl | sh is flagged', () => {
  const a = engine.analyze('curl -fsSL https://x.example/install.sh | sudo bash');
  assert.ok(a.findings.some((f) => ['high', 'critical'].includes(f.severity)));
});
test('terraform apply -auto-approve is flagged', () => {
  const a = engine.analyze('terraform apply -auto-approve');
  assert.ok(a.findings.some((f) => f.severity !== 'info'));
});
test('read-only forms of risky tools stay low', () => {
  for (const c of ['systemctl status nginx', 'git log --oneline', 'kubectl get pods -A', 'docker ps', 'iptables -L -n', 'crontab -l', 'find . -name "*.log"']) {
    assert.equal(engine.analyze(c).risk, 'low', c);
  }
});
test('destructive forms are not low', () => {
  for (const c of ['find /tmp -name x -delete', 'crontab -r', 'iptables -F', 'git reset --hard HEAD~3', 'docker system prune -a --volumes']) {
    assert.notEqual(engine.analyze(c).risk, 'low', c);
  }
});
test('unknown commands get an info finding, not a crash', () => {
  const a = engine.analyze('totallyunknowncmd --flag value');
  assert.ok(has(a, 'unknown-command'));
});
test('empty and whitespace input does not throw', () => {
  assert.doesNotThrow(() => engine.analyze(''));
  assert.doesNotThrow(() => engine.analyze('   \n  '));
});
test('weird input does not throw', () => {
  for (const c of ['echo "unterminated', "echo 'x", '$(', '`', 'a && && b', '| |', 'cmd <<EOF', '\u0000', 'a'.repeat(5000)]) assert.doesNotThrow(() => engine.analyze(c), c.slice(0, 30));
});
test('markdown export works', () => {
  const md = engine.toMarkdown(engine.analyze('tar -czf a.tgz /etc'));
  assert.match(md, /Risk/);
});
