// Validates data/** — run with `npm run validate` (add --stats for a summary, --strict to fail on warnings).
import { loadData, LCE } from './lib/load-data.mjs';

const args = new Set(process.argv.slice(2));
const data = loadData();
const problems = data.problems.slice();
const err = (file, msg) => problems.push({ level: 'error', file, msg });
const warn = (file, msg) => problems.push({ level: 'warn', file, msg });

const RISKS = ['low', 'medium', 'high'];
const SEVS = ['info', 'low', 'medium', 'high', 'critical'];
const str = (v) => typeof v === 'string' && v.trim().length > 0;

/* ── commands ── */
const ids = new Map(); const names = new Map();
for (const c of data.commands) {
  const where = `${c._file} → ${c.name || '(no name)'}`;
  if (!str(c.name)) { err(c._file, 'command without a name'); continue; }
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._+:\/\[\]-]*$/.test(c.name)) err(where, 'name has unusual characters');
  const id = c.id || LCE.slugify(c.name);
  if (ids.has(id)) err(where, `duplicate id "${id}" (also in ${ids.get(id)})`); else ids.set(id, c._file);
  const lname = c.name.toLowerCase();
  if (names.has(lname)) err(where, `duplicate name (also in ${names.get(lname)})`); else names.set(lname, c._file);
  if (!data.categories[c.category]) err(where, `unknown category "${c.category}" (add it to data/categories.json)`);
  if (c.kind && !['command', 'topic'].includes(c.kind)) err(where, 'kind must be "command" or "topic"');
  if (!str(c.summary)) err(where, 'missing summary'); else if (c.summary.length > 200) warn(where, 'summary is longer than 200 characters');
  if (!RISKS.includes(c.risk)) err(where, 'risk must be low, medium or high');
  if (!str(c.risk_reason)) err(where, 'missing risk_reason');
  if (!str(c.explanation) || c.explanation.length < 40) err(where, 'explanation is missing or too short (min 40 chars)');
  if (!Array.isArray(c.flags)) err(where, 'flags must be an array (use [] if none)');
  else c.flags.forEach((f, i) => { if (!str(f.flag)) err(where, `flags[${i}].flag missing`); if (!str(f.desc)) err(where, `flags[${i}].desc missing`); if (f.caution != null && !str(f.caution)) err(where, `flags[${i}].caution must be a string`); });
  if (!Array.isArray(c.examples) || c.examples.length < 1) err(where, 'needs at least one example');
  else c.examples.forEach((e, i) => { if (!str(e.cmd) || !str(e.desc)) err(where, `examples[${i}] needs cmd and desc`); });
  if (c.suggestions != null && !Array.isArray(c.suggestions)) err(where, 'suggestions must be an array of strings');
  if (c.cautions != null && (!Array.isArray(c.cautions) || c.cautions.some((x) => !str(x)))) err(where, 'cautions must be an array of non-empty strings');
  if ((c.risk === 'medium' || c.risk === 'high') && !(Array.isArray(c.cautions) && c.cautions.length)) err(where, `risk is ${c.risk} but there is no "cautions" array — add at least one caution message`);
  if (c.risk === 'high' && !(Array.isArray(c.safer) && c.safer.length)) warn(where, 'high-risk command has no "safer" alternative');
  for (const [i, s] of (c.safer || []).entries()) if (!str(s.cmd) || !str(s.why)) err(where, `safer[${i}] needs cmd and why`);
  if (c.match != null && (!Array.isArray(c.match) || c.match.some((x) => !str(x)))) err(where, 'match must be an array of strings');
}

/* ── engine-level checks (compiles rules + builds indexes) ── */
let eng = null;
try {
  eng = LCE.create({ commands: data.commands, categories: data.categories, rules: data.rules, intents: data.intents });
} catch (e) { err('data/rules', 'could not build engine: ' + e.message); }

/* ── rules ── */
const rids = new Set();
for (const r of data.rules.rules) {
  const where = `${r._file} → rule ${r.id}`;
  if (!str(r.id)) { err(r._file, 'rule without id'); continue; }
  if (rids.has(r.id)) err(where, 'duplicate rule id'); rids.add(r.id);
  if (!SEVS.includes(r.severity)) err(where, 'severity must be one of ' + SEVS.join(', '));
  if (!str(r.title) || !str(r.message)) err(where, 'needs title and message');
  if (!r.when && !r.raw && !r.requires) err(where, 'needs "when" (segment rule) or "raw" (whole-command rule)');
  for (const [i, s] of (r.safer || []).entries()) {
    if (!(str(s.cmd) || str(s.find) || str(s.why))) err(where, `safer[${i}] needs cmd, find/replace, or why`);
    if (s.find) { try { new RegExp(LCE.expandMacros(s.find), s.flags || ''); } catch (e) { err(where, `safer[${i}].find: ${e.message}`); } }
  }
  if (r.severity !== 'info' && !(r.safer && r.safer.length)) warn(where, 'no safer alternative / guidance given');
}
for (const s of data.rules.prod.signals) {
  try { new RegExp(LCE.expandMacros(s.regex), s.flags || 'i'); } catch (e) { err(`${s._file} → signal ${s.id}`, e.message); }
  if (!['prod', 'blast', 'note'].includes(s.kind)) err(`${s._file} → signal ${s.id}`, 'kind must be prod, blast or note');
}

/* ── intents ── */
const iids = new Set();
if (eng) {
  for (const it of data.intents) {
    const where = `${it._file} → intent ${it.id}`;
    if (!str(it.id)) { err(it._file, 'intent without id'); continue; }
    if (iids.has(it.id)) err(where, 'duplicate intent id'); iids.add(it.id);
    if (!str(it.title)) err(where, 'missing title');
    if (!Array.isArray(it.match) || !it.match.length || it.match.some((g) => !Array.isArray(g) || !g.length)) err(where, '"match" must be an array of keyword groups (each group an array of synonyms)');
    if (!Array.isArray(it.say) || !it.say.length) err(where, '"say" needs at least one example phrase');
    if (!str(it.cmd)) { err(where, 'missing cmd'); continue; }
    const used = [...it.cmd.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    for (const u of used) if (!it.slots || !it.slots[u]) err(where, `cmd uses {${u}} but slots.${u} is not defined`);
    for (const [k, sp] of Object.entries(it.slots || {})) if (!eng.extractorNames.includes(sp.from || k)) err(where, `slot "${k}" uses unknown extractor "${sp.from || k}" (valid: ${eng.extractorNames.join(', ')})`);
    if (!str(it.notes)) warn(where, 'no notes — add a one-line explanation or caution');
  }
}

/* ── cross checks that need the engine ── */
if (eng) {
  let unresolved = 0;
  for (const c of data.commands) {
    if (c.kind === 'topic') continue;
    const first = c.examples && c.examples[0] && c.examples[0].cmd;
    if (first) {
      try {
        const e = eng.lookup(first);
        if (!e) warn(`${c._file} → ${c.name}`, `its first example ("${first}") does not resolve to any entry`);
        else if (e.id !== (c.id || LCE.slugify(c.name))) warn(`${c._file} → ${c.name}`, `its first example resolves to "${e.name}" instead — check "match"/name`);
      } catch (e) { err(`${c._file} → ${c.name}`, 'engine threw on first example: ' + e.message); }
    }
    for (const s of c.suggestions || []) { if (!eng.byName.has(String(s).toLowerCase()) && !eng.byId.has(LCE.slugify(s))) unresolved++; }
  }
  if (unresolved) warn('suggestions', `${unresolved} suggestion(s) point to commands that have no page yet (they still work as clickable queries)`);
}

/* ── report ── */
const errors = problems.filter((p) => p.level === 'error');
const warns = problems.filter((p) => p.level === 'warn');
if (args.has('--stats') && eng) {
  const by = {}; for (const c of data.commands) by[c.category] = (by[c.category] || 0) + 1;
  console.log('Commands by category:'); for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1])) console.log('  ' + k.padEnd(16) + v);
  console.log('Totals:', JSON.stringify(eng.stats()));
}
for (const p of errors) console.error('ERROR ' + p.file + ': ' + p.msg);
const maxWarn = args.has('--all') ? Infinity : 25;
for (const p of warns.slice(0, maxWarn)) console.warn('warn  ' + p.file + ': ' + p.msg);
if (warns.length > maxWarn) console.warn(`… ${warns.length - maxWarn} more warnings (use --all)`);
console.log(`\n${data.commands.length} commands · ${data.rules.rules.length} rules · ${data.intents.length} intents · ${errors.length} errors · ${warns.length} warnings`);
process.exit(errors.length || (args.has('--strict') && warns.length) ? 1 : 0);
