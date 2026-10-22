#!/usr/bin/env node
// Static site generator. Output (committed, served by GitHub Pages from repo root):
//   index.html, cmd/<slug>/index.html, cmd/index.html, category/<cat>/index.html,
//   assets/{data.js,engine.js,app.js,style.css}, sitemap.xml, robots.txt, 404.html
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, LCE, loadData, stripPrivate } from './lib/load-data.mjs';

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const data = loadData();
if (data.problems.some((p) => p.level === 'error')) { console.error('Data has errors — run `npm run validate`.'); process.exit(1); }
const clean = stripPrivate({ categories: data.categories, commands: data.commands, rules: data.rules, intents: data.intents });
const engine = LCE.create(clean);
const entries = engine.entries;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const w = (rel, content) => { const p = path.join(ROOT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); };

// ── clean previous generated output ──
for (const d of ['cmd', 'category']) fs.rmSync(path.join(ROOT, d), { recursive: true, force: true });

// ── assets ──
const dataJs = 'window.LCE_DATA=' + JSON.stringify(clean) + ';\n';
const V = crypto.createHash('sha1').update(dataJs).update(fs.readFileSync(path.join(ROOT, 'src/engine.js'))).update(fs.readFileSync(path.join(ROOT, 'src/app.js'))).update(fs.readFileSync(path.join(ROOT, 'src/style.css'))).digest('hex').slice(0, 8);
w('assets/data.js', dataJs);
for (const f of ['engine.js', 'app.js', 'style.css']) fs.copyFileSync(path.join(ROOT, 'src', f), path.join(ROOT, 'assets', f));


const BASE = cfg.baseUrl.replace(/\/$/, '');
const basePath = new URL(BASE).pathname.replace(/\/$/, '') + '/';
const catTitle = (c) => (data.categories[c] && data.categories[c].title) || c;
const catIcon = (c) => (data.categories[c] && data.categories[c].icon) || '';
const real = entries.filter((e) => e.kind !== 'topic');
const byCat = {};
for (const e of entries) (byCat[e.category] ||= []).push(e);
const cats = Object.keys(data.categories).filter((c) => byCat[c] && byCat[c].length);
const COUNT = real.length;

// ── shared layout ──
function layout({ depth, title, description, canonical, body, jsonld = [], noindex = false, extra = '' }) {
  const up = '../'.repeat(depth);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
${noindex ? '<meta name="robots" content="noindex" />' : `<link rel="canonical" href="${esc(canonical)}" />`}
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:type" content="article" />
<meta property="og:url" content="${esc(canonical)}" />
<meta name="twitter:card" content="summary" />
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Syne:wght@400;600;800&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="${up}assets/style.css?v=${V}" />
</head>
<body>
<button class="theme-toggle" id="themeBtn" onclick="toggleTheme()"><span id="togIcon">&#9790;</span> <span id="togLabel">Light</span></button>
<div class="wrap">
${body}
</div>
<footer>Built with &#9829; by <a href="${esc(cfg.authorUrl)}">${esc(cfg.author)}</a> &nbsp;&middot;&nbsp; <a href="${up}">Explainer</a> &nbsp;&middot;&nbsp; <a href="${up}cmd/">All commands</a> &nbsp;&middot;&nbsp; <a href="${esc(cfg.repo)}">GitHub</a></footer>
<script>(function(){var t=null;try{t=localStorage.getItem('lce-theme')}catch(e){}function a(t){document.body.classList.toggle('light',t==='light');document.getElementById('togIcon').innerHTML=t==='light'?'&#9728;':'&#9790;';document.getElementById('togLabel').textContent=t==='light'?'Dark':'Light'}a(t||'dark');window.toggleTheme=function(){var n=document.body.classList.contains('light')?'dark':'light';a(n);try{localStorage.setItem('lce-theme',n)}catch(e){}}})();</script>
${extra}
</body>
</html>
`;
}
const crumbs = (depth, items) => {
  const up = '../'.repeat(depth);
  return `<nav class="crumbs" aria-label="Breadcrumb"><a href="${up}">Home</a>` + items.map((i) => ` &rsaquo; ${i.href ? `<a href="${up}${i.href}">${esc(i.label)}</a>` : esc(i.label)}`).join('') + '</nav>';
};
const breadcrumbLd = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })) });
const riskBadge = (r) => `<span class="risk-badge risk-${esc(r)}">${esc(r)} risk</span>`;
const tryLink = (cmd, depth) => `${'../'.repeat(depth)}?cmd=${encodeURIComponent(cmd)}`;
const url = (p) => BASE + '/' + p;

// ── command pages ──
function commandPage(e) {
  const depth = 2;
  const canonical = url(`cmd/${e.id}/`);
  const catT = catTitle(e.category);
  const label = e.kind === 'topic' ? `${e.name} (advanced)` : e.name;
  const title = `${e.kind === 'topic' ? e.name : e.name + ' command'}: ${e.summary.replace(/\.$/, '')} — examples, flags & risks | Linux Command Explainer`.slice(0, 160);
  const description = `${e.summary.replace(/\.$/, '')}. ${e.risk.toUpperCase()} risk: ${e.risk_reason}`.slice(0, 300);
  const flagRows = e.flags.map((f) => `<tr><td><code>${esc(f.flag)}</code>${f.long ? ` <code>${esc(f.long)}</code>` : ''}</td><td>${esc(f.desc)}${f.caution ? `<span class="tok-caution">&#9888; ${esc(f.caution)}</span>` : ''}</td></tr>`).join('');
  const related = (e.suggestions || []).map((s) => engine.resolveSuggestion(s)).filter((r) => r && r.id);
  let b = crumbs(depth, [{ label: catT, href: `category/${e.category}/` }, { label }]);
  b += `<header><h1 class="headline" style="font-size:clamp(28px,5vw,44px)"><span>${esc(label)}</span></h1><p class="sub">${esc(e.summary)}</p><p>${riskBadge(e.risk)}</p></header>`;
  const first0 = e.examples[0];
  b += `<div class="terminal-box"><div class="term-header"><div class="dot dot-r"></div><div class="dot dot-y"></div><div class="dot dot-g"></div><span class="term-title">interactive breakdown — edit the command and press Explain</span></div><div class="input-row"><span class="prompt">$&nbsp;</span><input id="cmdInput" type="text" list="cmdList" value="${esc(first0 ? first0.cmd : e.name)}" autocomplete="off" spellcheck="false" /><datalist id="cmdList"></datalist><button class="go-btn" id="goExplain">Explain &#8629;</button></div></div><div id="result"></div>`;
  b += `<div class="banner sev-${e.risk === 'high' ? 'high' : e.risk === 'medium' ? 'medium' : 'low'}"><span class="sev">${esc(e.risk)} risk</span>${esc(e.risk_reason)}</div>`;
  if (e.cautions.length) b += `<div class="card"><div class="card-title">&#9888; Risks &amp; cautions</div><ul class="caution-list">${e.cautions.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>`;
  if (e.safer.length) b += `<div class="card"><div class="card-title">Safer / dry-run alternatives</div>${e.safer.map((s) => `<div class="safer-item"><code>${esc(s.cmd)}</code><span class="why">${esc(s.why)}</span></div>`).join('')}</div>`;
  if (e.explanation) b += `<div class="card"><div class="card-title">What it does</div><p>${esc(e.explanation)}</p></div>`;
  if (e.flags.length) b += `<div class="card"><div class="card-title">Common flags</div><table class="flags-table"><thead><tr><th>Flag</th><th>Meaning</th></tr></thead><tbody>${flagRows}</tbody></table></div>`;
  if (e.examples.length) b += `<div class="card"><div class="card-title">Examples</div>${e.examples.map((x) => `<div class="safer-item"><code>${esc(x.cmd)}</code><span class="why">${esc(x.desc)} &middot; <a class="ex-explain" data-cmd="${esc(x.cmd)}" href="${esc(tryLink(x.cmd, depth))}">explain &amp; risk-check &rarr;</a></span></div>`).join('')}</div>`;
  if (e.pro_tip) b += `<div class="card protip-card"><div class="card-title">Pro tip</div><p>${esc(e.pro_tip)}</p></div>`;
  if (related.length) b += `<div class="card"><div class="card-title">Related</div><div>${related.map((r) => `<a class="sugg-chip" href="../${esc(r.id)}/">${esc(r.name)}</a>`).join(' ')}</div></div>`;
  const first = e.examples[0];
  b += `<div class="actions"><a class="btn" href="../../">Open the full explainer &rarr;</a><a class="btn" href="../../category/${esc(e.category)}/">More in ${esc(catT)}</a></div>`;
  b += `<p class="disclaimer">Reference text is hand-written and may be incomplete — check <code>man ${esc(e.name.split(' ')[0])}</code> for your version. Test destructive commands on a non-production system first.</p>`;
  const faq = [
    { q: `What does ${e.name} do?`, a: e.summary + (e.explanation ? ' ' + e.explanation : '') },
    { q: `Is ${e.name} dangerous?`, a: `${e.risk.toUpperCase()} risk. ${e.risk_reason}` + (e.cautions.length ? ' ' + e.cautions.join(' ') : '') },
  ];
  if (e.safer.length) faq.push({ q: `How can I use ${e.name} more safely?`, a: e.safer.map((s) => `${s.cmd} — ${s.why}`).join(' ') });
  const ld = [
    breadcrumbLd([{ name: 'Home', url: BASE + '/' }, { name: catT, url: url(`category/${e.category}/`) }, { name: label, url: canonical }]),
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
  ];
  const extra = `<script>window.LCE_BASE=${JSON.stringify(basePath)};window.LCE_PAGE={cmd:${JSON.stringify(first0 ? first0.cmd : e.name).replace(/</g, '\\u003c')}};</script>\n<script src="../../assets/data.js?v=${V}"></script>\n<script src="../../assets/engine.js?v=${V}"></script>\n<script src="../../assets/app.js?v=${V}"></script>`;
  return layout({ depth, title, description, canonical, body: b, jsonld: ld, extra });
}
for (const e of entries) w(`cmd/${e.id}/index.html`, commandPage(e));

// ── directory + category pages ──
const link = (e, up) => `<li><a href="${up}cmd/${esc(e.id)}/">${esc(e.name)}<small>${esc(e.summary)}</small></a></li>`;
{
  let b = crumbs(1, [{ label: 'All commands' }]);
  b += `<header><h1 class="headline" style="font-size:clamp(28px,5vw,44px)">All <span>${COUNT} commands</span></h1><p class="sub">Every command with risks, cautions, flags and examples.</p></header>`;
  for (const c of cats) b += `<div class="card"><div class="card-title">${catIcon(c)} ${esc(catTitle(c))}</div><ul class="dir-grid">${byCat[c].slice().sort((a, z) => a.name.localeCompare(z.name)).map((e) => link(e, '../')).join('')}</ul></div>`;
  w('cmd/index.html', layout({ depth: 1, title: `All ${COUNT} Linux, Kubernetes, Docker & Git commands explained | Linux Command Explainer`, description: `Directory of ${COUNT} commands with explanations, risk levels, cautions and safer alternatives.`, canonical: url('cmd/'), body: b }));
}
for (const c of cats) {
  const list = byCat[c].slice().sort((a, z) => a.name.localeCompare(z.name));
  let b = crumbs(2, [{ label: catTitle(c) }]);
  b += `<header><h1 class="headline" style="font-size:clamp(28px,5vw,44px)">${catIcon(c)} <span>${esc(catTitle(c))}</span></h1><p class="sub">${esc((data.categories[c] || {}).description || '')}</p></header>`;
  b += `<ul class="dir-grid">${list.map((e) => link(e, '../../')).join('')}</ul>`;
  w(`category/${c}/index.html`, layout({ depth: 2, title: `${catTitle(c)} commands explained (${list.length}) | Linux Command Explainer`, description: `${(data.categories[c] || {}).description || ''} ${list.length} entries with risks and examples.`, canonical: url(`category/${c}/`), body: b, jsonld: [breadcrumbLd([{ name: 'Home', url: BASE + '/' }, { name: catTitle(c), url: url(`category/${c}/`) }])] }));
}

// ── index ──
const POP = ['ls -lah /var/log', 'find /var/log -name "*.log" -mtime +30 -delete', 'rsync -avz /src/ user@host:/dest/', 'ss -tulnp', 'tar -czf backup.tar.gz /var/log', 'chmod -R 755 /var/www', 'kubectl get pods -A -o wide', 'kubectl delete pod web-1 -n production --force', 'terraform apply -auto-approve', 'git push --force', 'docker run -v /:/host --privileged ubuntu', 'ps aux | grep nginx | awk \'{print $2}\' | xargs kill -9', 'curl -fsSL https://get.example.com | sudo bash', 'iptables -F', 'journalctl -u nginx --since today', 'df -hT'];
const DESC = ['find files larger than 500MB', 'show what is using port 8080', 'delete log files older than 30 days', 'restart a pod in kubernetes', 'compress a folder into tar.gz', 'show top memory processes', 'undo last git commit', 'check disk usage by folder'];
const attr = (s) => esc(s).replace(/\\/g, '\\\\');
const chips = POP.map((c) => `<span class="chip" onclick="quick(${esc(JSON.stringify(c))})">${esc(c.length > 28 ? c.slice(0, 26) + '…' : c)}</span>`).join('');
const dchips = DESC.map((c) => `<span class="chip" onclick="quickDesc(${esc(JSON.stringify(c))})">${esc(c)}</span>`).join('');
const catLinks = cats.map((c) => `<li><a href="category/${c}/">${catIcon(c)} ${esc(catTitle(c))}<small>${byCat[c].length} entries</small></a></li>`).join('');
const jsonld = JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebApplication', name: cfg.name, url: BASE + '/', applicationCategory: 'DeveloperApplication', operatingSystem: 'Any', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, author: { '@type': 'Organization', name: cfg.author, url: cfg.authorUrl } });
const tpl = fs.readFileSync(path.join(ROOT, 'src/index.template.html'), 'utf8');
w('index.html', tpl.replace(/\{\{COUNT\}\}/g, String(COUNT)).replace(/\{\{BASE\}\}/g, BASE).replace(/\{\{BASEPATH\}\}/g, basePath).replace(/\{\{V\}\}/g, V).replace('{{CHIPS}}', chips).replace('{{DESCCHIPS}}', dchips).replace('{{CATLINKS}}', catLinks).replace('{{JSONLD}}', jsonld));

// ── 404, robots, sitemap ──
w('404.html', layout({ depth: 0, title: 'Page not found | Linux Command Explainer', description: 'Page not found', canonical: BASE + '/', noindex: true, body: `<header><h1 class="headline"><span>404</span></h1><p class="sub">That page does not exist. Try the <a href="${basePath}">explainer</a> or the <a href="${basePath}cmd/">command directory</a>.</p></header>`.replace(/href="\.\.\//g, 'href="/') }).replace(/href="assets\//g, `href="${basePath}assets/`).replace(/href="cmd\/"/g, `href="${basePath}cmd/"`).replace(/href=""/g, `href="${basePath}"`));
w('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`);
const urls = ['', 'cmd/', ...cats.map((c) => `category/${c}/`), ...entries.map((e) => `cmd/${e.id}/`)];
w('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` + urls.map((u) => `  <url><loc>${BASE}/${u}</loc></url>`).join('\n') + '\n</urlset>\n');

console.log(`built: ${entries.length} entries (${COUNT} commands), ${cats.length} categories, ${urls.length} URLs, v=${V}`);
