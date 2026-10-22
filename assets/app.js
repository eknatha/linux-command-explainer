/* Linux Command Explainer — browser app. Offline: only the star + visitor counters use the network. */
(function () {
  'use strict';
  var engine = window.LCE.create(window.LCE_DATA);
  var PAGE = window.LCE_PAGE || null; // set on /cmd/<name>/ pages
  var $ = function (id) { return document.getElementById(id) || document.createElement('div'); }; // detached stub when a page lacks the element
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var BASE = (window.LCE_BASE || '/');
  var mode = 'explain';
  var last = null;

  /* ── theme ── */
  function applyTheme(t) {
    document.body.classList.toggle('light', t === 'light');
    $('togIcon').innerHTML = t === 'light' ? '&#9728;' : '&#9790;';
    $('togLabel').textContent = t === 'light' ? 'Dark' : 'Light';
  }
  window.toggleTheme = function () {
    var t = document.body.classList.contains('light') ? 'dark' : 'light';
    applyTheme(t); try { localStorage.setItem('lce-theme', t); } catch (e) {}
  };
  try { applyTheme(localStorage.getItem('lce-theme') || 'dark'); } catch (e) { applyTheme('dark'); }

  /* ── render helpers ── */
  function riskBadge(r) { return '<span class="risk-badge risk-' + esc(r) + '">' + esc(r) + ' risk</span>'; }
  function saferHtml(list) {
    return list.map(function (s) {
      return '<div class="safer-item"><code>' + esc(s.cmd) + '</code><span class="why">' + esc(s.why || '') + (s.derived ? ' <em>(your command, adjusted)</em>' : '') + '</span></div>';
    }).join('');
  }
  function renderSegment(s, depth) {
    var h = '<div class="card"><div class="card-title">' + (depth ? 'Inner command' + (s.via ? ' · ' + esc(s.via) : '') : 'Breakdown') + '</div>';
    h += '<div class="seg-title">' + esc(s.cmdline || s.text) + '</div>';
    if (s.entrySummary) h += '<p>' + esc(s.entrySummary) + '</p>';
    h += '<div class="tokens">';
    s.tokens.forEach(function (t) {
      h += '<div class="token"><span class="tok-part">' + esc(t.part) + '</span> <span class="tok-type">' + esc(t.type) + '</span><div class="tok-desc">' + esc(t.desc) + (t.caution ? '<span class="tok-caution">&#9888; ' + esc(t.caution) + '</span>' : '') + '</div></div>';
    });
    h += '</div>';
    if (s.entryId) h += '<div class="actions"><a class="btn" href="' + BASE + 'cmd/' + esc(s.entryId) + '/">Full reference for ' + esc(s.entryName || s.base) + ' &rarr;</a></div>';
    h += '</div>';
    (s.inner || []).forEach(function (a) { a.segments.forEach(function (x) { h += renderSegment(Object.assign({ via: a.via }, x), (depth || 0) + 1); }); });
    return h;
  }
  function renderAnalysis(a, opts) {
    opts = opts || {};
    var h = '';
    h += '<div class="result-header"><div class="result-cmd">' + esc(a.input) + '</div>' + riskBadge(a.risk) + '</div>';
    if (a.riskBumped) h += '<div class="banner prod"><b>Risk raised from ' + esc(a.baseRisk) + ' to ' + esc(a.risk) + '</b> because of production / blast-radius signals below.</div>';
    a.signals.forEach(function (s) {
      h += '<div class="banner ' + (s.kind === 'prod' ? 'prod' : 'sev-high') + '"><span class="sev">' + (s.kind === 'prod' ? 'production context' : 'blast radius') + '</span><b>' + esc(s.label) + '</b> — ' + esc(s.message) + (s.mitigation ? '<br><em>Do instead: ' + esc(s.mitigation) + '</em>' : '') + '</div>';
    });
    a.findings.forEach(function (f) {
      if (f.severity === 'info' && !opts.showInfo) return;
      h += '<div class="banner sev-' + esc(f.severity) + '"><span class="sev">' + esc(f.severity) + '</span><b>' + esc(f.title) + '</b> — ' + esc(f.message) + '</div>';
    });
    if (a.safer.length) h += '<div class="card"><div class="card-title">Safer / dry-run version of your command</div>' + saferHtml(a.safer) + '</div>';
    if (a.saferNotes.length) h += '<div class="card"><div class="card-title">Safer practice</div><ul class="caution-list">' + a.saferNotes.map(function (n) { return '<li>' + esc(n.why) + '</li>'; }).join('') + '</ul></div>';
    if (a.isChain) {
      h += '<div class="card"><div class="card-title">How the chain flows</div><ol class="chain">' + a.chain.map(function (c) { return '<li><code>' + esc(c.text) + '</code>' + (c.meaning ? ' — ' + esc(c.meaning) : '') + '</li>'; }).join('') + '</ol></div>';
    }
    a.segments.forEach(function (s) { h += renderSegment(s, 0); });
    if (a.cautions.length) h += '<div class="card"><div class="card-title">&#9888; Cautions</div><ul class="caution-list">' + a.cautions.map(function (c) { return '<li><b>' + esc(c.from) + ':</b> ' + esc(c.text) + '</li>'; }).join('') + '</ul></div>';
    if (a.entrySafer.length) h += '<div class="card"><div class="card-title">Safer habits</div>' + saferHtml(a.entrySafer) + '</div>';
    if (a.related.length) h += '<div class="card"><div class="card-title">Related</div>' + a.related.map(function (r) { return '<span class="sugg-chip" data-q="' + esc(r.name || r) + '">' + esc(r.name || r) + '</span>'; }).join(' ') + '</div>';
    h += '<div class="actions"><button class="btn" id="copyLink">Copy link</button><button class="btn" id="copyMd">Copy as Markdown</button></div>';
    h += '<p class="disclaimer">Local rule-based analysis — it can miss things. Read the command yourself, test on a non-production system and keep a backup before changing anything.</p>';
    return h;
  }

  function setUrl(k, v) {
    if (PAGE) return; // command pages keep their clean permalink
    try { var u = new URL(location.href); u.search = ''; if (v) u.searchParams.set(k, v); history.replaceState(null, '', u.toString()); } catch (e) {}
  }
  function copy(text, btn) {
    var done = function () { if (btn) { var o = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = o; }, 1200); } };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done); else done();
  }

  function explain(q, noScroll) {
    q = (q == null ? $('cmdInput').value : q).trim();
    if (!q) return;
    $('cmdInput').value = q;
    var a = engine.analyze(q);
    last = a;
    setUrl('cmd', q);
    $('result').innerHTML = renderAnalysis(a);
    wire();
    if (!noScroll) $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function describe(q) {
    q = (q == null ? $('descInput').value : q).trim();
    if (!q) return;
    $('descInput').value = q;
    setUrl('d', q);
    var res = engine.reverse(q, { limit: 4 });
    var h = '';
    if (!res.length) h = '<div class="card"><div class="card-title">No match</div><p>No built-in recipe matches that yet. Try different words (e.g. &ldquo;find files larger than 100M&rdquo;), or <a href="https://github.com/eknatha/linux-command-explainer/issues/new?template=command-request.yml">request one</a>.</p></div>';
    res.forEach(function (r, i) {
      h += '<div class="rev-card"><h3>' + esc(r.title) + ' ' + riskBadge(r.analysis.risk) + '</h3><div class="cmdline">' + esc(r.cmd) + '</div>';
      if (r.missing.length) h += '<div class="missing">Replace: ' + r.missing.map(function (m) { return '&lt;' + esc(m) + '&gt;'; }).join(', ') + '</div>';
      if (r.notes) h += '<div class="rev-notes">' + esc(r.notes) + '</div>';
      r.analysis.findings.filter(function (f) { return f.severity !== 'info'; }).forEach(function (f) { h += '<div class="banner sev-' + esc(f.severity) + '"><span class="sev">' + esc(f.severity) + '</span><b>' + esc(f.title) + '</b> — ' + esc(f.message) + '</div>'; });
      r.analysis.cautions.slice(0, 3).forEach(function (c) { h += '<div class="rev-notes">&#9888; ' + esc(c.text) + '</div>'; });
      if (r.analysis.safer.length) h += '<div class="rev-notes"><b>Safer:</b></div>' + saferHtml(r.analysis.safer.slice(0, 2));
      if (r.alts.length) h += '<div class="rev-notes"><b>Alternatives:</b></div>' + r.alts.map(function (x) { return '<div class="safer-item"><code>' + esc(x.cmd) + '</code><span class="why">' + esc(x.desc) + '</span></div>'; }).join('');
      h += '<div class="actions"><button class="btn" data-copy="' + i + '">Copy command</button><button class="btn" data-explain="' + i + '">Explain it &rarr;</button></div></div>';
    });
    h += '<p class="disclaimer">Suggestions are templates matched from your wording. Replace placeholders, read the command, and test before running — especially on production.</p>';
    $('result').innerHTML = h;
    $('result').querySelectorAll('[data-copy]').forEach(function (b) { b.onclick = function () { copy(res[+b.dataset.copy].cmd, b); }; });
    $('result').querySelectorAll('[data-explain]').forEach(function (b) { b.onclick = function () { setMode('explain'); explain(res[+b.dataset.explain].cmd); }; });
  }
  function wire() {
    var r = $('result');
    var l = r.querySelector('#copyLink'); if (l) l.onclick = function () { copy(location.href, l); };
    var m = r.querySelector('#copyMd'); if (m) m.onclick = function () { copy(engine.toMarkdown(last), m); };
    r.querySelectorAll('.sugg-chip').forEach(function (c) { c.onclick = function () { explain(c.dataset.q); }; });
  }
  function setMode(m) {
    mode = m;
    $('tabExplain').classList.toggle('active', m === 'explain');
    $('tabDescribe').classList.toggle('active', m === 'describe');
    $('paneExplain').hidden = m !== 'explain';
    $('paneDescribe').hidden = m !== 'describe';
  }
  window.quick = function (c) { setMode('explain'); explain(c); };
  window.quickDesc = function (c) { setMode('describe'); describe(c); };
  window.randomCmd = function () {
    var pool = engine.entries.filter(function (e) { return e.kind !== 'topic' && e.examples.length; });
    var e = pool[Math.floor(Math.random() * pool.length)];
    setMode('explain'); explain(e.examples[0].cmd);
  };

  $('tabExplain').onclick = function () { setMode('explain'); };
  $('tabDescribe').onclick = function () { setMode('describe'); };
  $('goExplain').onclick = function () { explain(); };
  $('goDescribe').onclick = function () { describe(); };
  $('cmdInput').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); explain(); } });
  $('descInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); describe(); } });

  /* autocomplete: command names as you type the first word */
  $('cmdInput').addEventListener('input', function () {
    var v = this.value; if (/\s/.test(v)) return;
    var dl = $('cmdList'); dl.innerHTML = engine.completions(v, 10).map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
  });

  /* command of the day */
  (function () {
    var pool = engine.entries.filter(function (e) { return e.kind !== 'topic' && e.examples.length; });
    var d = new Date(), seed = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate();
    var e = pool[seed % pool.length];
    $('cotdCmd').textContent = e.examples[0].cmd; $('cotdSummary').textContent = e.summary;
    $('cotdBanner').onclick = function () { setMode('explain'); explain(e.examples[0].cmd); };
  })();

  /* deep link */
  var p = new URLSearchParams(location.search);
  if (p.get('cmd')) { setMode('explain'); explain(p.get('cmd')); }
  else if (p.get('d')) { setMode('describe'); describe(p.get('d')); }
  else if (PAGE && PAGE.cmd) explain(PAGE.cmd, true);
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('.ex-explain');
    if (a) { ev.preventDefault(); explain(a.getAttribute('data-cmd')); }
  });

  /* ── stars + visitors (the only network calls; home page only) ── */
  if (PAGE) return;
  try {
    fetch('https://api.github.com/repos/eknatha/linux-command-explainer').then(function (r) { return r.json(); }).then(function (d) {
      if (d.stargazers_count != null) $('ghStarCount').textContent = d.stargazers_count.toLocaleString() + ' ★';
    }).catch(function () { $('ghStarCount').textContent = '★ Star'; });
  } catch (e) {}
  (function () {
    function set(id, v) { var el = $(id); if (!el) return; el.textContent = (typeof v === 'number') ? v.toLocaleString() : v; el.classList.remove('loading'); }
    var today = new Date().toISOString().slice(0, 10), n = 1;
    try {
      if (localStorage.getItem('ek-seen-date') !== today) {
        n = (parseInt(localStorage.getItem('ek-today-count') || '0', 10) || 0) + 1;
        if (localStorage.getItem('ek-count-date') !== today) n = 1;
        localStorage.setItem('ek-today-count', n); localStorage.setItem('ek-count-date', today); localStorage.setItem('ek-seen-date', today);
      } else n = parseInt(localStorage.getItem('ek-today-count') || '1', 10);
    } catch (e) {}
    set('todayCount', n);
    var hit = true; try { hit = sessionStorage.getItem('ek-total-hit') !== '1'; } catch (e) {}
    var url = 'https://api.counterapi.dev/v1/eknathalabs/linux-explainer-total' + (hit ? '/up' : '');
    fetch(url).then(function (r) { return r.json(); }).then(function (d) {
      var v = d.count || d.value || d.hits; if (v == null) throw 0;
      try { if (hit) sessionStorage.setItem('ek-total-hit', '1'); localStorage.setItem('ek-total-cache', v); } catch (e) {}
      set('totalCount', v);
    }).catch(function () { var c = null; try { c = localStorage.getItem('ek-total-cache'); } catch (e) {} set('totalCount', c ? Number(c).toLocaleString() : '—'); });
  })();
})();
