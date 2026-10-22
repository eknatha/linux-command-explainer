#!/usr/bin/env node
// Scaffold a new command entry:  npm run new -- <name> [category]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadData } from './lib/load-data.mjs';
const [name, cat = 'linux-system'] = process.argv.slice(2);
if (!name) { console.error('Usage: npm run new -- <command name> [category]\nCategories: ' + Object.keys(loadData().categories).join(', ')); process.exit(1); }
const file = path.join(ROOT, 'data', 'commands', cat + '.json');
const j = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { category: cat, commands: [] };
if (j.commands.some((c) => c.name.toLowerCase() === name.toLowerCase())) { console.error(`"${name}" already exists in ${cat}.json`); process.exit(1); }
j.commands.push({
  name, summary: 'TODO: one-line summary', risk: 'low', risk_reason: 'TODO: why this risk level',
  cautions: ['TODO: what can go wrong (required for medium/high risk)'],
  explanation: 'TODO: 2–3 sentences on what it does and when to use it.',
  flags: [{ flag: '-x', desc: 'TODO' }],
  examples: [{ cmd: name + ' --help', desc: 'TODO' }],
  safer: [], suggestions: [], pro_tip: '',
});
fs.writeFileSync(file, JSON.stringify(j, null, 2) + '\n');
console.log(`Added a stub for "${name}" to data/commands/${cat}.json — fill in the TODOs, then run: npm run check`);
