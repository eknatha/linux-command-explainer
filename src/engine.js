/*! Linux Command Explainer — engine
 *  Shell-aware parser, command lookup, safety rules, prod-context detection,
 *  safer-alternative generation and "describe → command" matching.
 *  Pure JS, zero dependencies; runs in the browser and in Node (build, tests).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LCE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RISK = ['low', 'medium', 'high', 'critical'];
  const SEV = ['info', 'low', 'medium', 'high', 'critical'];
  const rIdx = (r) => RISK.indexOf(r);
  const sIdx = (s) => SEV.indexOf(s);
  const maxRisk = (a, b) => (!a ? b : !b ? a : rIdx(a) >= rIdx(b) ? a : b);
  const sevToRisk = (s) => (s === 'info' ? null : s);

  const slugify = (s) =>
    String(s).toLowerCase().replace(/[^a-z0-9._]+/g, '-').replace(/^-+|-+$/g, '');

  /* ───────────────────────── LEXER ───────────────────────── */

  function matchParen(src, open) {
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      const c = src[i];
      if (c === '\\') { i++; continue; }
      if (c === "'") { const j = src.indexOf("'", i + 1); if (j < 0) return src.length; i = j; continue; }
      if (c === '"') { let j = i + 1; while (j < src.length && src[j] !== '"') { if (src[j] === '\\') j++; j++; } i = j; continue; }
      if (c === '(') depth++;
      else if (c === ')') { depth--; if (depth === 0) return i; }
    }
    return src.length;
  }

  function lex(src) {
    const toks = [];
    const n = src.length;
    let i = 0;
    const isWs = (c) => c === ' ' || c === '\t' || c === '\r';

    function readWord() {
      const s = i;
      let raw = '', val = '', quoted = false;
      const subs = [];
      while (i < n) {
        const c = src[i];
        if (isWs(c) || c === '\n' || c === ';' || c === '&' || c === '|' || c === '<' || c === '>' || c === '(' || c === ')') break;
        if (c === '\\') {
          if (src[i + 1] === '\n') { i += 2; continue; }
          raw += c + (src[i + 1] || ''); val += src[i + 1] || ''; i += 2; continue;
        }
        if (c === "'") {
          const j = src.indexOf("'", i + 1); const end = j < 0 ? n : j;
          raw += src.slice(i, end + 1); val += src.slice(i + 1, end); quoted = true; i = end + 1; continue;
        }
        if (c === '"') {
          let j = i + 1, inner = '';
          while (j < n && src[j] !== '"') {
            if (src[j] === '\\') { inner += src[j] + (src[j + 1] || ''); j += 2; continue; }
            if (src[j] === '$' && src[j + 1] === '(') { const e = matchParen(src, j + 1); subs.push(src.slice(j + 2, e)); inner += src.slice(j, e + 1); j = e + 1; continue; }
            if (src[j] === '`') { const e = src.indexOf('`', j + 1); const end = e < 0 ? n : e; subs.push(src.slice(j + 1, end)); inner += src.slice(j, end + 1); j = end + 1; continue; }
            inner += src[j]; j++;
          }
          raw += src.slice(i, j + 1); val += inner; quoted = true; i = j + 1; continue;
        }
        if (c === '$' && src[i + 1] === '(') {
          const e = matchParen(src, i + 1); subs.push(src.slice(i + 2, e));
          raw += src.slice(i, e + 1); val += src.slice(i, e + 1); i = e + 1; continue;
        }
        if (c === '`') {
          const e = src.indexOf('`', i + 1); const end = e < 0 ? n : e; subs.push(src.slice(i + 1, end));
          raw += src.slice(i, end + 1); val += src.slice(i, end + 1); i = end + 1; continue;
        }
        raw += c; val += c; i++;
      }
      if (i === s) return null;
      return { t: 'word', raw, val, quoted, subs, s, e: i };
    }

    while (i < n) {
      const c = src[i];
      if (c === '\\' && src[i + 1] === '\n') { i += 2; continue; }
      if (c === '\n') { toks.push({ t: 'op', v: '\n', s: i, e: i + 1 }); i++; continue; }
      if (isWs(c)) { i++; continue; }
      if (c === '#' && (i === 0 || /\s/.test(src[i - 1]))) { while (i < n && src[i] !== '\n') i++; continue; }
      if ((c === '<' || c === '>') && src[i + 1] === '(') {
        const e = matchParen(src, i + 1);
        const raw = src.slice(i, e + 1);
        toks.push({ t: 'word', raw, val: raw, quoted: false, subs: [src.slice(i + 2, e)], procsub: true, s: i, e: e + 1 });
        i = e + 1; continue;
      }
      const m = /^(&>>|&>|\d*>&(?:\d+|-)|\d*<&(?:\d+|-)|\d*>>|\d*>\||\d*>|<<<|<<-?|\d*<>|\d*<)/.exec(src.slice(i, i + 8));
      if (m) {
        const s = i; const v = m[1]; i += v.length;
        const tok = { t: 'redir', v, target: null, s, e: i };
        if (!/&(\d+|-)$/.test(v)) {
          while (i < n && isWs(src[i])) i++;
          const w = readWord();
          if (w) { tok.target = w; tok.e = w.e; }
        }
        toks.push(tok); continue;
      }
      const two = src.substr(i, 2);
      if (two === '&&' || two === '||' || two === '|&' || two === ';;') { toks.push({ t: 'op', v: two, s: i, e: i + 2 }); i += 2; continue; }
      if (c === '|' || c === ';' || c === '&' || c === '(' || c === ')') { toks.push({ t: 'op', v: c, s: i, e: i + 1 }); i++; continue; }
      const w = readWord();
      if (w) toks.push(w); else i++;
    }
    return toks;
  }

  const STRIP_KEYWORDS = new Set(['do', 'then', 'else', 'elif', 'if', 'while', 'until', '!', '{', '}', 'time']);
  const SYNTAX_WORDS = {
    for: 'Loop header: runs the following block once per item in the list.',
    select: 'Menu loop header.',
    case: 'Pattern-matching block (case … esac).',
    esac: 'End of a case block.',
    done: 'End of a loop body.',
    fi: 'End of an if block.',
    function: 'Defines a shell function.',
  };

  function segmentize(src, toks) {
    const segs = [];
    let cur = { words: [], redirs: [], group: false };
    let pendingOp = null;
    const flush = (op) => {
      if (cur.words.length || cur.redirs.length) {
        const first = [...cur.words, ...cur.redirs].sort((a, b) => a.s - b.s);
        cur.s = first[0].s; cur.e = Math.max(...first.map((x) => x.e));
        cur.text = src.slice(cur.s, cur.e);
        cur.opBefore = pendingOp;
        segs.push(cur);
        pendingOp = op;
      } else if (op && (!pendingOp || op !== ';')) pendingOp = op;
      cur = { words: [], redirs: [], group: false };
    };
    for (const t of toks) {
      if (t.t === 'word') cur.words.push(t);
      else if (t.t === 'redir') cur.redirs.push(t);
      else if (t.v === '(' || t.v === ')') { cur.group = true; flush(';'); }
      else flush(t.v === '\n' ? ';' : t.v);
    }
    flush(null);
    for (const s of segs) {
      while (s.words.length && STRIP_KEYWORDS.has(s.words[0].val)) s.words.shift();
      if (s.words.length && SYNTAX_WORDS[s.words[0].val]) { s.kind = 'syntax'; s.syntax = SYNTAX_WORDS[s.words[0].val]; }
    }
    return segs.filter((s) => s.words.length || s.redirs.length || s.kind);
  }

  /* ───────────────────── WRAPPERS & INNER COMMANDS ───────────────────── */

  const WRAPPERS = {
    sudo: { vo: ['-u', '-g', '-h', '-p', '-C', '-r', '-t', '-U', '-D', '-T'], pos: 0, note: 'Runs the command as another user (root by default).', priv: true },
    doas: { vo: ['-u', '-C'], pos: 0, note: 'Runs the command as another user (root by default).', priv: true },
    env: { vo: ['-u', '-C', '-S'], pos: 0, assign: true, note: 'Runs the command with a modified environment.' },
    time: { vo: ['-f', '-o'], pos: 0, note: 'Reports how long the command takes.' },
    nohup: { vo: [], pos: 0, note: 'Keeps the command running after the terminal closes.' },
    nice: { vo: ['-n'], pos: 0, note: 'Runs the command with adjusted CPU priority.' },
    ionice: { vo: ['-c', '-n', '-p', '-P', '-u'], pos: 0, note: 'Runs the command with adjusted I/O priority.' },
    timeout: { vo: ['-s', '-k', '--signal', '--kill-after'], pos: 1, note: 'Kills the command if it runs longer than the given duration.' },
    watch: { vo: ['-n', '--interval'], pos: 0, note: 'Re-runs the command periodically and shows its output.' },
    xargs: { vo: ['-I', '-L', '-n', '-P', '-d', '-E', '-s', '-a'], pos: 0, note: 'Builds the command line from standard input.', xargs: true },
    setsid: { vo: [], pos: 0, note: 'Runs the command in a new session.' },
    stdbuf: { vo: [], pos: 0, note: 'Changes buffering of the command’s standard streams.' },
    flock: { vo: ['-w', '-E'], pos: 1, note: 'Takes a file lock while the command runs.' },
    command: { vo: [], pos: 0, note: 'Bypasses shell functions and aliases.', skipIf: ['-v', '-V'] },
    builtin: { vo: [], pos: 0, note: 'Runs a shell builtin.' },
    exec: { vo: ['-a'], pos: 0, note: 'Replaces the shell with the command.' },
  };

  function stripWrappers(words) {
    const wrappers = [];
    let w = words.slice();
    for (let guard = 0; guard < 8 && w.length; guard++) {
      const name = w[0].val;
      const spec = WRAPPERS[name];
      if (!spec) break;
      if (spec.skipIf && w[1] && spec.skipIf.includes(w[1].val)) break;
      let j = 1;
      while (w[j] && (w[j].val.startsWith('-') || (spec.assign && /^[A-Za-z_]\w*=/.test(w[j].val)))) {
        const o = w[j].val;
        j++;
        if (spec.vo.includes(o)) j++;
      }
      j += spec.pos;
      wrappers.push({ name, note: spec.note, priv: !!spec.priv, xargs: !!spec.xargs });
      w = w.slice(j);
    }
    return { argv: w, wrappers };
  }

  const SSH_VALUE_OPTS = new Set(['-p', '-i', '-l', '-o', '-F', '-J', '-L', '-R', '-D', '-b', '-c', '-m', '-E', '-O', '-S', '-W', '-w', '-B', '-e', '-I', '-Q']);

  function extractInner(argv) {
    const inner = [];
    if (!argv.length) return inner;
    const base = baseName(argv[0].val);
    const vals = argv.map((w) => w.val);
    if (['bash', 'sh', 'zsh', 'dash', 'ksh'].includes(base)) {
      const k = vals.indexOf('-c');
      if (k > 0 && argv[k + 1]) inner.push({ via: base + ' -c', src: argv[k + 1].val });
    } else if (base === 'su') {
      const k = vals.indexOf('-c');
      if (k > 0 && argv[k + 1]) inner.push({ via: 'su -c', src: argv[k + 1].val });
    } else if (base === 'eval') {
      if (argv.length > 1) inner.push({ via: 'eval', src: argv.slice(1).map((w) => w.val).join(' ') });
    } else if (base === 'ssh') {
      let j = 1;
      while (argv[j] && argv[j].val.startsWith('-')) { if (SSH_VALUE_OPTS.has(argv[j].val)) j++; j++; }
      if (argv[j] && argv[j + 1]) inner.push({ via: 'ssh (remote)', src: argv.slice(j + 1).map((w) => (w.quoted ? w.val : w.raw)).join(' ') });
    } else if (base === 'kubectl') {
      const k = vals.indexOf('--');
      if (k > 0 && argv[k + 1]) inner.push({ via: 'kubectl (inside the container)', src: argv.slice(k + 1).map((w) => (w.quoted ? w.val : w.raw)).join(' ') });
    }
    // find -exec / -execdir / -ok
    for (let i = 0; i < vals.length; i++) {
      if (['-exec', '-execdir', '-ok', '-okdir'].includes(vals[i])) {
        const parts = [];
        let j = i + 1;
        while (j < vals.length && vals[j] !== ';' && vals[j] !== '+') { parts.push(argv[j].raw); j++; }
        if (parts.length) inner.push({ via: 'find ' + vals[i], src: parts.join(' ') });
      }
    }
    // watch/timeout with a single quoted command string
    return inner;
  }

  const baseName = (s) => String(s || '').replace(/^.*\//, '');

  /* ───────────────────── MACROS FOR RULE REGEXES ───────────────────── */

  function expandMacros(str) {
    return String(str)
      .replace(/\{\{SHORT:([^}]+)\}\}/g, (_, cls) => '(?:^|\\s)-[A-Za-z]*[' + cls + '][A-Za-z]*(?=\\s|$)')
      .replace(/\{\{LONG:([^}]+)\}\}/g, (_, name) => '(?:^|\\s)--' + name + '(?:=\\S*)?(?=\\s|$)')
      .replace(/\{\{WORD:([^}]+)\}\}/g, (_, w) => '(?:^|\\s)(?:' + w + ')(?=\\s|$)')
      .replace(/\{\{FLAG:([^}]+)\}\}/g, (_, f) => '(?:^|\\s)(?:' + f + ')(?:=\\S*)?(?=\\s|$)');
  }
  const compileRe = (s, flags) => new RegExp(expandMacros(s), flags || '');

  /* ───────────────────── ENGINE FACTORY ───────────────────── */

  const GLOBAL_VALUE_FLAGS = {
    kubectl: ['-n', '--namespace', '--context', '--cluster', '--kubeconfig', '-s', '--server', '--user', '--token', '--as', '--request-timeout'],
    helm: ['-n', '--namespace', '--kube-context', '--kubeconfig'],
    git: ['-C', '-c', '--git-dir', '--work-tree', '--namespace'],
    docker: ['-H', '--host', '--context', '-l', '--log-level', '--config'],
    podman: ['--url', '--connection', '-c'],
    aws: ['--profile', '--region', '--output', '--endpoint-url', '--query'],
    az: ['--subscription', '--output', '-o', '--query'],
    gcloud: ['--project', '--account', '--format', '--configuration'],
    terraform: ['-chdir'],
    systemctl: ['-H', '--host', '-M', '--machine', '-t', '--type', '-p', '--property'],
  };

  const U = (desc, caution) => ({ flag: '', desc, caution: caution || null });
  const UNIVERSAL_FLAGS = { '--help': U('Show the built-in help.'), '-h': null, '--version': U('Print the version and exit.'), '--dry-run': U('Show what would happen without changing anything.') };
  const COMMON_FLAGS = {
    kubectl: { '-n': U('Namespace to use.'), '--namespace': U('Namespace to use.'), '-A': U('All namespaces.'), '--all-namespaces': U('All namespaces.'), '--context': U('Which kubeconfig context (cluster/user) to use.'), '--kubeconfig': U('Use this kubeconfig file.'), '-o': U('Output format (wide, yaml, json, name, jsonpath=…).'), '--output': U('Output format (wide, yaml, json, name, jsonpath=…).'), '-l': U('Label selector.'), '--selector': U('Label selector.'), '-f': U('Manifest file, directory or URL.'), '--filename': U('Manifest file, directory or URL.'), '-k': U('Kustomize directory.'), '-R': U('Process directories recursively.'), '-w': U('Watch for changes.'), '--watch': U('Watch for changes.'), '-c': U('Container name inside the pod.'), '--container': U('Container name inside the pod.'), '-it': U('Interactive terminal (-i keeps stdin open, -t allocates a TTY).'), '-i': U('Keep stdin open.'), '-t': U('Allocate a TTY.'), '--force': U('Skip graceful handling / force the operation.', 'Bypasses safety checks — see the warnings.'), '--grace-period': U('Seconds to wait before force-killing.'), '--all': U('Apply to all objects of the kind.', 'Affects every object that matches.'), '--sort-by': U('Sort output by a JSONPath expression.'), '--show-labels': U('Show labels as a column.'), '--field-selector': U('Filter by object fields.'), '--tail': U('Number of log lines from the end.'), '--since': U('Only logs newer than this duration.'), '--previous': U('Logs of the previous (crashed) container instance.'), '-p': U('Previous container logs (logs) or patch body (patch).'), '--replicas': U('Desired replica count.'), '--dry-run': U('Simulate: client = locally, server = validated by the API server, none = do it.'), '--timeout': U('Give up after this duration.'), '--wait': U('Wait for the operation to finish.'), '--cascade': U('Delete dependents: background, foreground or orphan.'), '--prune': U('Delete live objects not in the applied set.', 'Can delete objects you did not intend to remove.'), '--server-side': U('Use server-side apply.'), '--field-manager': U('Name of the manager for server-side apply.'), '--image': U('Container image.'), '--ignore-daemonsets': U('Ignore DaemonSet-managed pods when draining.'), '--delete-emptydir-data': U('Delete emptyDir data when evicting pods.', 'Data in emptyDir volumes is lost.'), '--as': U('Impersonate this user.'), '--token': U('Bearer token for authentication.'), '--insecure-skip-tls-verify': U('Skip TLS verification.', 'Disables server certificate verification.') },
    helm: { '-n': U('Namespace.'), '--namespace': U('Namespace.'), '-f': U('Values file.'), '--values': U('Values file.'), '--set': U('Override a single value (key=val).'), '--set-string': U('Override a value as a string.'), '--version': U('Chart version to use.'), '--install': U('Install the release if it does not exist.'), '--atomic': U('Roll back automatically if the upgrade fails.'), '--wait': U('Wait until resources are ready.'), '--timeout': U('Give up after this duration.'), '--dry-run': U('Render and validate without installing.'), '--debug': U('Verbose output.'), '--create-namespace': U('Create the namespace if missing.'), '--keep-history': U('Keep release history after uninstall.'), '--force': U('Delete and recreate resources if needed.', 'Can cause downtime.'), '--kube-context': U('Kubeconfig context to use.'), '--reuse-values': U('Reuse the values of the last release.'), '--reset-values': U('Reset to chart defaults.'), '-o': U('Output format.') },
    docker: { '-d': U('Detached: run in the background.'), '-it': U('Interactive terminal.'), '-i': U('Keep stdin open.'), '-t': U('Allocate a TTY.'), '--rm': U('Remove the container when it exits.'), '-p': U('Publish a port (host:container).'), '-v': U('Bind-mount a volume or host path.'), '-e': U('Set an environment variable.'), '--name': U('Name the container.'), '--network': U('Attach to a network.'), '-f': U('Force / follow / file depending on the subcommand.'), '--force': U('Force the operation.', 'Skips safety checks.'), '-a': U('All (including stopped) objects.'), '--all': U('All objects.'), '--privileged': U('Give the container extended host privileges.', 'Equivalent to root on the host.'), '--restart': U('Restart policy.'), '--format': U('Format output with a Go template.'), '--no-cache': U('Do not use build cache.'), '-t ': U('Tag.'), '--tail': U('Lines from the end of the logs.'), '--follow': U('Follow log output.'), '--since': U('Only logs newer than this.'), '--volumes': U('Also remove volumes.', 'Deletes volume data.'), '--user': U('Run as this user.'), '--workdir': U('Working directory inside the container.'), '--entrypoint': U('Override the image entrypoint.'), '--platform': U('Target platform.'), '--pull': U('Pull policy.'), '--env-file': U('Read environment variables from a file.'), '--cap-add': U('Add Linux capabilities.'), '--memory': U('Memory limit.'), '--cpus': U('CPU limit.') },
    git: { '-C': U('Run as if started in this directory.'), '-c': U('Set a config value for this command.'), '--force': U('Force the operation.', 'Can discard or overwrite work.'), '-f': U('Force the operation.', 'Can discard or overwrite work.'), '--force-with-lease': U('Force only if the remote branch is where you last saw it.'), '-u': U('Set upstream / include untracked.'), '--hard': U('Reset index and working tree.', 'Discards uncommitted changes.'), '--soft': U('Move HEAD only; keep index and working tree.'), '--amend': U('Replace the last commit.', 'Rewrites history if already pushed.'), '--no-verify': U('Skip hooks.'), '-m': U('Commit/stash message.'), '-a': U('Stage all tracked changes / all branches.'), '-b': U('Create and switch to a new branch.'), '-d': U('Delete (safe) / dry-run depending on the command.'), '-D': U('Force delete.', 'Deletes even unmerged branches.'), '--oneline': U('One line per commit.'), '--graph': U('ASCII commit graph.'), '--all': U('All refs.'), '-n': U('Limit count / dry-run depending on the command.'), '--stat': U('Show diffstat.'), '-p': U('Show patch / interactive selection.'), '--rebase': U('Rebase instead of merge when pulling.'), '--ff-only': U('Only fast-forward.'), '--no-ff': U('Always create a merge commit.'), '--tags': U('Include tags.'), '--delete': U('Delete the remote ref.', 'Removes it for everyone.'), '--prune': U('Remove remote-tracking refs that no longer exist.'), '--depth': U('Shallow clone with this many commits.'), '--recurse-submodules': U('Also handle submodules.'), '--set-upstream': U('Set the upstream branch.') },
    aws: { '--profile': U('Named AWS CLI profile (credentials/account) to use.'), '--region': U('AWS region.'), '--output': U('Output format: json, text, table, yaml.'), '--query': U('JMESPath filter for the output.'), '--dry-run': U('Check permissions/parameters without performing the action (EC2).'), '--dryrun': U('Show what would be transferred/deleted (S3).'), '--recursive': U('Apply to all objects under the prefix.', 'Affects every object under the prefix.'), '--delete': U('Delete destination files that are not in the source.', 'Destructive on the destination.'), '--force': U('Skip confirmation / force.', 'Skips safety checks.'), '--no-cli-pager': U('Do not use a pager.'), '--endpoint-url': U('Use a custom endpoint (e.g. LocalStack).'), '--no-verify-ssl': U('Do not verify TLS certificates.', 'Disables certificate verification.'), '--acl': U('Canned ACL for uploaded objects.'), '--exclude': U('Exclude matching files.'), '--include': U('Include matching files.'), '--instance-ids': U('Target EC2 instance IDs.'), '--filters': U('Filter results.') },
    az: { '-g': U('Resource group.'), '--resource-group': U('Resource group.'), '-n': U('Resource name.'), '--name': U('Resource name.'), '-o': U('Output format: json, table, tsv, yaml.'), '--output': U('Output format.'), '--query': U('JMESPath filter.'), '--subscription': U('Subscription ID or name.'), '--yes': U('Skip the confirmation prompt.', 'Nothing will ask “are you sure?”.'), '-y': U('Skip the confirmation prompt.', 'Nothing will ask “are you sure?”.'), '--no-wait': U('Do not wait for the long-running operation.'), '-l': U('Location / region.'), '--location': U('Location / region.'), '--only-show-errors': U('Suppress warnings.'), '--tags': U('Space-separated tags.') },
    gcloud: { '--project': U('Project ID.'), '--format': U('Output format.'), '--quiet': U('Disable prompts (assume defaults/yes).', 'Skips confirmation prompts.'), '-q': U('Disable prompts (assume defaults/yes).', 'Skips confirmation prompts.'), '--zone': U('Compute zone.'), '--region': U('Region.'), '--account': U('Account to use.') },
    terraform: { '-var': U('Set an input variable.'), '-var-file': U('Load variables from a file.'), '-target': U('Limit the operation to this resource.', 'Partial applies can leave state and config out of sync.'), '-auto-approve': U('Apply without asking for confirmation.', 'No review step before changes are made.'), '-out': U('Save the plan to a file.'), '-input': U('Enable/disable interactive prompts.'), '-lock': U('Lock the state file (default true).'), '-lock-timeout': U('How long to wait for the state lock.'), '-refresh': U('Refresh state before planning.'), '-replace': U('Force replacement of this resource.', 'Destroys and recreates the resource.'), '-destroy': U('Plan/apply a destroy.', 'Deletes resources.'), '-parallelism': U('Number of concurrent operations.'), '-chdir': U('Run in another directory.'), '-json': U('Machine-readable output.'), '-no-color': U('Disable colours.'), '-detailed-exitcode': U('Exit 2 when there are changes (CI-friendly).'), '-compact-warnings': U('Show warnings compactly.'), '-upgrade': U('Upgrade providers/modules.'), '-backend-config': U('Backend configuration.'), '-reconfigure': U('Reconfigure the backend ignoring saved config.'), '-migrate-state': U('Migrate state to a new backend.') },
  };
  function commonFlag(base, name) {
    const t = COMMON_FLAGS[base === 'oc' ? 'kubectl' : base === 'tofu' || base === 'terragrunt' ? 'terraform' : base === 'podman' || base === 'nerdctl' ? 'docker' : base];
    const f = (t && t[name]) || UNIVERSAL_FLAGS[name];
    return f || null;
  }

  function create(data) {
    const entries = [];
    const byId = new Map();
    const byName = new Map();
    const matchIndex = new Map();
    const categories = data.categories || {};
    const rulesData = data.rules || { rules: [], prod: { signals: [] } };
    const intents = data.intents || [];

    function parseFlagNames(str) {
      return String(str || '')
        .split(/[\s,\/|]+/)
        .map((x) => x.replace(/=.*$/, '').replace(/\[.*$/, '').replace(/<.*$/, ''))
        .filter((x) => /^--?[A-Za-z0-9]/.test(x));
    }

    for (const raw of data.commands || []) {
      const e = Object.assign({}, raw);
      e.id = e.id || slugify(e.name);
      e.kind = e.kind || 'command';
      e.flags = e.flags || [];
      e.examples = e.examples || [];
      e.suggestions = e.suggestions || [];
      e.cautions = e.cautions || [];
      e.safer = e.safer || [];
      e.match = (e.match || (e.kind === 'topic' ? [] : [e.name])).concat(e.aliases || []).map((s) => s.toLowerCase());
      e.flagMap = {};
      for (const f of e.flags) for (const n of parseFlagNames(f.flag).concat(parseFlagNames(f.long))) e.flagMap[n] = f;
      entries.push(e);
      byId.set(e.id, e);
      byName.set(e.name.toLowerCase(), e);
      for (const m of e.match) if (!matchIndex.has(m)) matchIndex.set(m, e);
    }

    // compile rules
    const rules = (rulesData.rules || []).map((r) => {
      const c = Object.assign({}, r);
      const when = r.when == null ? [] : Array.isArray(r.when) ? r.when : [r.when];
      c._when = when.map((w) => compileRe(w, r.flags));
      c._not = (r.not == null ? [] : Array.isArray(r.not) ? r.not : [r.not]).map((w) => compileRe(w, r.flags));
      c._raw = r.raw ? compileRe(r.raw, r.flags) : null;
      c.scope = r.scope || (r.raw ? 'raw' : 'segment');
      return c;
    });
    const signals = ((rulesData.prod || {}).signals || []).map((s) => Object.assign({}, s, { _re: compileRe(s.regex, s.flags || 'i') }));

    /* ── lookup ── */
    function subcommandCandidates(words) {
      // words: string[] (argv values). Returns [{key, idxs}] longest first.
      const base = baseName(words[0]).toLowerCase();
      const skipVals = GLOBAL_VALUE_FLAGS[base] || [];
      const bare = [{ w: base, i: 0 }];
      for (let i = 1; i < words.length && bare.length < 5; i++) {
        const w = words[i];
        if (w === '--') break;
        if (w.startsWith('-')) { if (skipVals.includes(w.replace(/=.*$/, '')) && !w.includes('=')) i++; continue; }
        bare.push({ w: w.toLowerCase(), i });
      }
      const out = [];
      for (let k = bare.length; k >= 1; k--) {
        out.push({ key: bare.slice(0, k).map((b) => b.w).join(' '), idxs: bare.slice(0, k).map((b) => b.i) });
      }
      return out;
    }

    function findEntry(words) {
      if (!words.length) return null;
      let w0 = baseName(words[0]);
      if (w0 === '[' || w0 === '[[') words = ['test'].concat(words.slice(1));
      for (const c of subcommandCandidates(words)) {
        const e = matchIndex.get(c.key);
        if (e) return { entry: e, idxs: c.idxs };
      }
      return null;
    }

    function lookup(input) {
      const s = String(input || '').trim().toLowerCase();
      if (byName.has(s)) return byName.get(s);
      if (byId.has(s)) return byId.get(s);
      const words = s.split(/\s+/);
      const r = findEntry(words);
      return r ? r.entry : null;
    }

    /* ── token classification ── */
    function classifyArg(w) {
      const v = w.val;
      if (w.procsub) return ['subst', 'process substitution — the command’s output is presented as a temporary file'];
      if (/^\$\(|^`/.test(v) || w.subs.length) return ['subst', 'command substitution — runs first and its output is inserted here'];
      if (/^https?:\/\/|^ftp:\/\/|^s3:\/\//.test(v)) return ['url', 'URL / remote location'];
      if (/^[\w.-]+@[\w.-]+(:|$)/.test(v)) return ['hostspec', 'remote target (user@host[:path])'];
      if (/^\$/.test(v)) return ['variable', 'variable — expanded by the shell (quote it: "$VAR")'];
      if (!w.quoted && /[*?]|\[[^\]]+\]/.test(v) && !/^\//.test(v.replace(/[*?]/g, ''))) return ['glob', 'glob pattern — the shell expands it to matching names before the command runs'];
      if (!w.quoted && /[*?]/.test(v)) return ['glob', 'glob pattern — the shell expands it to matching names before the command runs'];
      if (/^(\/|~|\.{1,2}\/|\.$|\.\.$)/.test(v)) return ['path', 'file or directory path'];
      if (/^\d+(\.\d+)?$/.test(v)) return ['number', 'number'];
      if (/^[A-Za-z_]\w*=/.test(v)) return ['assignment', 'key=value setting'];
      if (/^[\w.-]+\/[\w.-]+$/.test(v)) return ['ref', 'resource reference or relative path (type/name)'];
      if (w.quoted) return ['string', 'quoted string — passed as a single argument'];
      return ['argument', 'argument'];
    }

    function redirMeaning(r) {
      const t = r.target ? r.target.val : '';
      const v = r.v;
      if (/^\d*>&(\d+|-)$/.test(v)) return v === '2>&1' ? 'Sends errors (stderr) to the same place as normal output (stdout).' : 'Duplicates/redirects file descriptors (' + v + ').';
      if (v === '&>' || v === '&>>') return (v === '&>' ? 'Overwrites ' : 'Appends to ') + t + ' with both output and errors.';
      if (/^2>>$/.test(v)) return 'Appends errors (stderr) to ' + t + '.';
      if (/^2>$/.test(v)) return t === '/dev/null' ? 'Discards error messages (stderr).' : 'Writes errors (stderr) to ' + t + ', replacing its contents.';
      if (/^1?>>$/.test(v)) return 'Appends normal output to ' + t + '.';
      if (/^1?>\|?$/.test(v)) return t === '/dev/null' ? 'Discards normal output.' : 'Writes normal output to ' + t + ', replacing (truncating) its contents.';
      if (v === '<') return 'Reads standard input from ' + t + '.';
      if (v === '<<' || v === '<<-') return 'Here-document: feeds the following lines as standard input.';
      if (v === '<<<') return 'Here-string: feeds ' + t + ' as standard input.';
      return 'Redirection ' + v + ' ' + t;
    }

    /* ── analysis ── */
    function analyzeString(src, depth, via) {
      depth = depth || 0;
      const toks = lex(src);
      const segs = segmentize(src, toks);
      const out = {
        raw: src, via: via || null, depth,
        segments: [], findings: [], cautions: [], safer: [],
        inner: [], unknown: [], flags: [],
      };
      segs.forEach((s, idx) => out.segments.push(analyzeSegment(s, idx, src, depth)));

      // raw-scope rules
      for (const r of rules) {
        if (r.scope !== 'raw' || !r._raw) continue;
        if (r._raw.test(src) && !(r._not.length && r._not.some((re) => re.test(src)))) {
          out.findings.push(makeFinding(r, null, src, src));
        }
      }
      // gather
      for (const s of out.segments) {
        out.findings.push(...s.findings);
        for (const c of s.cautions) out.cautions.push(c);
        if (s.unknownCommand) out.unknown.push(s.base);
        for (const inn of s.inner) {
          out.inner.push(inn);
          for (const f of inn.findings) {
            out.findings.push(Object.assign({}, f, {
              via: f.via ? f.via : inn.via,
              safer: f.safer.map((sv) => (sv.derived && src.includes(inn.raw) ? Object.assign({}, sv, { cmd: src.replace(inn.raw, sv.cmd) }) : sv)),
            }));
          }
          for (const c of inn.cautions) out.cautions.push(c);
          for (const u of inn.unknown) out.unknown.push(u);
        }
      }
      return out;
    }

    function makeFinding(rule, seg, text, raw) {
      const f = {
        id: rule.id, title: rule.title, severity: rule.severity || 'medium', message: rule.message,
        scope: seg ? 'segment' : 'raw', segIndex: seg ? seg.index : null, segText: seg ? seg.text : null,
        tags: rule.tags || [], safer: [],
      };
      for (const sp of rule.safer || []) {
        if (sp.find) {
          const re = new RegExp(expandMacros(sp.find), sp.flags || '');
          const nt = text.replace(re, sp.replace == null ? '' : sp.replace);
          if (nt !== text) f.safer.push({ cmd: raw.replace(text, nt), why: sp.why || '', derived: true });
        } else if (sp.cmd) {
          const sub = (tpl) => tpl
            .replace(/\{seg\}/g, text)
            .replace(/\{raw\}/g, raw)
            .replace(/\{args\}/g, seg ? seg.args : '')
            .replace(/\{arg1\}/g, seg ? (seg.positional[0] || '<path>') : '<path>')
            .replace(/\{arg2\}/g, seg ? (seg.positional[1] || '<path>') : '<path>')
            .replace(/\{pos\}/g, seg && seg.positional.length ? seg.positional.join(' ') : '<path>')
            .replace(/\{last\}/g, seg && seg.positional.length ? seg.positional[seg.positional.length - 1] : '<name>')
            .replace(/\{base\}/g, seg ? seg.base : '');
          f.safer.push({ cmd: sub(sp.cmd), why: sp.why || '', derived: false });
        } else if (sp.why) {
          f.safer.push({ cmd: null, why: sp.why, derived: false });
        }
      }
      return f;
    }

    function analyzeSegment(seg, index, srcRaw, depth) {
      const res = {
        index, text: seg.text, opBefore: seg.opBefore || null, kind: seg.kind || 'command',
        base: '', entryId: null, entryName: null, entryRisk: null, entrySummary: null,
        tokens: [], wrappers: [], envAssign: [], redirs: [], flagsUsed: [], unknownFlags: [],
        findings: [], cautions: [], inner: [], args: '', positional: [], cmdline: '', facts: {},
        unknownCommand: false,
      };
      for (const r of seg.redirs) res.redirs.push({ op: r.v, target: r.target ? r.target.val : null, meaning: redirMeaning(r) });
      if (seg.kind === 'syntax') { res.tokens = seg.words.map((w, i) => ({ part: w.raw, type: i === 0 ? 'keyword' : 'argument', desc: i === 0 ? seg.syntax : classifyArg(w)[1] })); res.syntax = seg.syntax; return res; }

      // env assignments
      let words = seg.words.slice();
      while (words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0].val)) { res.envAssign.push(words.shift().raw); }
      if (!words.length) {
        res.kind = 'assignment';
        res.tokens = res.envAssign.map((a) => ({ part: a, type: 'assignment', desc: 'sets a shell variable' }));
        analyzeRedirs(res, seg);
        return res;
      }
      const sw = stripWrappers(words);
      res.wrappers = sw.wrappers;
      const argv = sw.argv;
      for (const a of res.envAssign) res.tokens.push({ part: a, type: 'assignment', desc: 'environment variable set for this command only' });
      for (const w of seg.words.slice(res.envAssign.length, seg.words.length - argv.length)) {
        const wr = WRAPPERS[w.val];
        res.tokens.push({ part: w.raw, type: wr ? 'wrapper' : 'argument', desc: wr ? wr.note : 'option for the wrapper command' });
      }
      if (!argv.length) {
        if (sw.wrappers.some((w) => w.priv) && seg.words.some((w) => /^-[A-Za-z]*[is]$/.test(w.val))) {
          res.findings.push({ id: 'sudo-root-shell', title: 'Opens a root shell', severity: 'low', message: 'A permanent root shell has no per-command audit trail and every typo runs as root. Prefer `sudo <command>`.', scope: 'segment', segIndex: index, segText: res.text, tags: ['privilege'], safer: [] });
        }
        analyzeRedirs(res, seg); return res;
      }

      const vals = argv.map((w) => w.val);
      res.base = baseName(vals[0]);
      res.cmdline = argv.map((w) => w.raw).join(' ');
      res.args = argv.slice(1).map((w) => w.raw).join(' ');
      res.positional = argv.slice(1).filter((w) => !w.val.startsWith('-')).map((w) => w.val);
      res.facts = {
        sudo: sw.wrappers.some((w) => w.priv),
        viaXargs: sw.wrappers.some((w) => w.xargs),
        unquotedVar: argv.slice(1).some((w) => !w.quoted && /\$\{?[A-Za-z_]/.test(w.val)),
        glob: argv.slice(1).some((w) => !w.quoted && /[*?]/.test(w.val)),
        subst: argv.slice(1).some((w) => w.subs.length > 0),
      };

      const hit = findEntry(vals);
      const entry = hit ? hit.entry : null;
      const nameIdx = new Set(hit ? hit.idxs : [0]);
      if (entry) {
        res.entryId = entry.id; res.entryName = entry.name; res.entryRisk = entry.risk; res.entrySummary = entry.summary;
        // read-only usage (e.g. `systemctl status`, `git log`) is not the risky form of the command
        const ctext = (seg.args || '') + ' ' + (seg.text || '');
        const rx = (list) => (list || []).some((r) => { try { return new RegExp(r).test(ctext); } catch (e) { return false; } });
        if (entry.low_when && rx(entry.low_when) && !rx(entry.low_unless)) res.entryRisk = 'low';
        else for (const c of entry.cautions) res.cautions.push({ from: entry.name, text: c });
      } else {
        res.unknownCommand = true;
      }

      // tokens
      let afterDD = false;
      argv.forEach((w, i) => {
        const v = w.val;
        if (nameIdx.has(i)) {
          const first = i === 0;
          res.tokens.push({ part: w.raw, type: first ? 'command' : 'subcommand', desc: first ? (entry ? entry.summary : 'program — not in the local database yet') : 'subcommand' });
          return;
        }
        if (afterDD) { const [t, d] = classifyArg(w); res.tokens.push({ part: w.raw, type: t, desc: d }); return; }
        if (v === '--') { afterDD = true; res.tokens.push({ part: w.raw, type: 'separator', desc: 'end of options — everything after is a positional argument or an inner command' }); return; }
        if (/^--?[A-Za-z0-9]/.test(v) && !w.quoted) {
          const name = v.replace(/=.*$/, '');
          const info = (entry && entry.flagMap[name]) || commonFlag(res.base, name);
          if (info) {
            res.tokens.push({ part: w.raw, type: 'flag', desc: info.desc, caution: info.caution || null });
            res.flagsUsed.push({ token: w.raw, flag: info.flag, long: info.long || '', desc: info.desc, caution: info.caution || null });
          } else if (/^-[A-Za-z0-9]{2,}$/.test(v) && entry) {
            const parts = v.slice(1).split('').map((ch) => ({ ch, info: entry.flagMap['-' + ch] }));
            if (parts.every((p) => p.info)) {
              res.tokens.push({ part: w.raw, type: 'flag', desc: 'combined short flags: ' + parts.map((p) => '-' + p.ch + ' ' + p.info.desc.replace(/\.$/, '')).join(' · '), cluster: true });
              for (const p of parts) res.flagsUsed.push({ token: '-' + p.ch, flag: p.info.flag, long: p.info.long || '', desc: p.info.desc, caution: p.info.caution || null });
            } else {
              const known = parts.filter((p) => p.info);
              res.tokens.push({ part: w.raw, type: 'flag', desc: (known.length ? 'combined short flags: ' + known.map((p) => '-' + p.ch + ' ' + p.info.desc.replace(/\.$/, '')).join(' · ') + '; ' : '') + 'others not in the local reference — check `' + res.base + ' --help`', cluster: true });
              for (const p of known) res.flagsUsed.push({ token: '-' + p.ch, flag: p.info.flag, long: p.info.long || '', desc: p.info.desc, caution: p.info.caution || null });
              res.unknownFlags.push(w.raw);
            }
          } else {
            res.tokens.push({ part: w.raw, type: 'flag', desc: entry ? 'option not in the local reference — check `' + res.base + ' --help`' : 'option / flag' });
            if (entry) res.unknownFlags.push(w.raw);
          }
          return;
        }
        const [t, d] = classifyArg(w);
        res.tokens.push({ part: w.raw, type: t, desc: d });
      });
      for (const fu of res.flagsUsed) if (fu.caution) res.cautions.push({ from: res.base + ' ' + fu.token, text: fu.caution });

      // rules (segment scope)
      for (const r of rules) {
        if (r.scope !== 'segment') continue;
        if (r.cmd && !r.cmd.includes(res.base) && !(entry && r.cmd.includes(entry.name))) continue;
        const hay = r.target === 'cmdline' ? res.cmdline : res.args;
        if (!r._when.every((re) => re.test(hay))) continue;
        if (r._not.length && r._not.some((re) => re.test(hay))) continue;
        if (r.requires && !r.requires.every((k) => res.facts[k])) continue;
        res.findings.push(makeFinding(r, res, res.text, srcRaw));
      }
      // wrapper findings
      if (res.facts.sudo) {
        res.findings.push({ id: 'sudo', title: 'Runs with elevated privileges', severity: 'info', message: 'A typo or a wrong path is applied with root rights and can affect the whole system. Re-read the command before pressing Enter.', scope: 'segment', segIndex: index, segText: res.text, tags: ['privilege'], safer: [] });
      }
      if (res.unknownCommand && depth === 0) {
        res.findings.push({ id: 'unknown-command', title: 'Not in the local database yet', severity: 'info', message: 'Check `man ' + res.base + '` or `' + res.base + ' --help` before running it, especially with sudo or on production systems.', scope: 'segment', segIndex: index, segText: res.text, tags: ['unknown'], safer: [] });
      }
      analyzeRedirs(res, seg);

      // inner commands
      const inners = extractInner(argv);
      if (res.facts.viaXargs) res.facts.xargs = true;
      for (const inn of inners) {
        if (depth >= 3) break;
        const a = analyzeString(inn.src, depth + 1, inn.via);
        a.via = inn.via;
        res.inner.push(a);
      }
      // command substitutions
      const subs = [];
      for (const w of seg.words) for (const sb of w.subs) subs.push(sb);
      for (const sb of subs) {
        if (depth >= 3) break;
        const a = analyzeString(sb, depth + 1, 'command substitution');
        a.via = 'command substitution';
        res.inner.push(a);
      }
      return res;
    }

    function analyzeRedirs(res, seg) {
      for (const r of seg.redirs) {
        const t = r.target ? r.target.val : '';
        const isOut = /^(&?\d*>>?\|?|&>>?)$/.test(r.v) && !/&(\d+|-)$/.test(r.v);
        if (isOut && /^\/dev\/(sd|nvme|vd|xvd|hd|mmcblk|dm-|md)/.test(t)) {
          res.findings.push({ id: 'redir-block-device', title: 'Writes directly to a block device', severity: 'critical', message: 'Redirecting output to ' + t + ' overwrites raw disk data and destroys the filesystem on it.', scope: 'segment', segIndex: res.index, segText: res.text, tags: ['destructive'], safer: [{ cmd: 'lsblk -f', why: 'Confirm the right device before writing anything to it.', derived: false }] });
        } else if (/^(1?>|&>|\d*>\|)$/.test(r.v) && t && !/^\/dev\/(null|stdout|stderr|tty|fd\/)/.test(t) && !/^&/.test(t)) {
          const sys = /^\/(etc|boot|usr|bin|sbin|lib|lib64|var\/lib|root|opt)\b/.test(t);
          res.findings.push({
            id: 'redir-truncate', title: 'Output redirect overwrites ' + t, severity: sys ? 'high' : 'low',
            message: '`>` truncates ' + t + ' to zero bytes before the command even runs — existing content is lost.' + (sys ? ' This is a system path.' : ''),
            scope: 'segment', segIndex: res.index, segText: res.text, tags: ['overwrite'],
            safer: [{ cmd: res.text.replace(/(^|\s)(1?>)(\s*)/, '$1>>$3'), why: 'Use >> to append instead of overwrite.', derived: true }, { cmd: 'set -o noclobber', why: 'Makes `>` refuse to overwrite existing files (use >| to force).', derived: false }],
          });
        }
        if (/^2>$/.test(r.v) && t === '/dev/null') {
          res.findings.push({ id: 'redir-hide-errors', title: 'Error messages are hidden', severity: 'info', message: '`2>/dev/null` silences failures such as “Permission denied” — the command may be skipping things without telling you.', scope: 'segment', segIndex: res.index, segText: res.text, tags: ['visibility'], safer: [] });
        }
        if (res.facts.sudo && isOut && t && !/^\/dev\//.test(t)) {
          res.findings.push({ id: 'sudo-redirect', title: 'sudo does not cover the redirect', severity: 'low', message: 'Your own shell opens ' + t + ', not sudo — it will fail with “Permission denied” on root-owned files.', scope: 'segment', segIndex: res.index, segText: res.text, tags: ['gotcha'], safer: [{ cmd: '... | sudo tee ' + t + (/>>/.test(r.v) ? ' -a' : ''), why: 'Let tee (running under sudo) open the file.', derived: false }] });
        }
      }
    }

    /* ── top-level analyze ── */
    function analyze(input) {
      const raw = String(input == null ? '' : input).replace(/\r\n/g, '\n').trim();
      const a = analyzeString(raw, 0, null);
      a.input = raw;

      // chain description
      a.chain = a.segments.map((s) => ({ index: s.index, text: s.text, op: s.opBefore, meaning: chainMeaning(s.opBefore) }));
      a.isChain = a.segments.length > 1;

      // prod / blast-radius signals
      a.signals = [];
      for (const sg of signals) {
        if (sg._re.test(raw)) a.signals.push({ id: sg.id, kind: sg.kind || 'blast', label: sg.label, message: sg.message, mitigation: sg.mitigation || '', needs: sg.needs || null });
      }

      // risk aggregation
      const all = collectSegments(a);
      let level = null;
      for (const s of all) level = maxRisk(level, s.entryRisk);
      level = level || 'low';
      for (const f of a.findings) level = maxRisk(level, sevToRisk(f.severity));
      const mutating = rIdx(level) >= 1;
      a.baseRisk = level;
      const prod = a.signals.filter((s) => s.kind === 'prod');
      const blast = a.signals.filter((s) => s.kind === 'blast' && (!s.needs || mutating));
      a.signals = a.signals.filter((s) => s.kind === 'prod' || !s.needs || mutating);
      a.prod = { detected: prod.length > 0, blast: blast.length > 0 };
      let bumped = level;
      if (mutating && (a.prod.detected || a.prod.blast)) {
        let inc = 0;
        if (a.prod.detected) inc++;
        if (blast.length >= 2 || (blast.length === 1 && rIdx(level) < 2)) inc++;
        bumped = RISK[Math.min(3, rIdx(level) + inc)];
      }
      a.riskBumped = bumped !== level;
      a.risk = bumped;

      // reasons
      a.riskReasons = [];
      const top = all.filter((s) => s.entryRisk).sort((x, y) => rIdx(y.entryRisk) - rIdx(x.entryRisk))[0];
      if (top) { const e = byId.get(top.entryId); if (e && e.risk_reason) a.riskReasons.push({ from: e.name, text: e.risk_reason }); }

      // sort findings
      const seen = new Set();
      a.findings = a.findings.filter((f) => { const k = f.id + '|' + f.segIndex + '|' + (f.via || ''); if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((x, y) => sIdx(y.severity) - sIdx(x.severity));

      // cautions (dedupe)
      const cs = new Set();
      a.cautions = a.cautions.filter((c) => { const k = c.text; if (cs.has(k)) return false; cs.add(k); return true; });

      // safer versions (derived first)
      const sv = []; const sk = new Set();
      for (const f of a.findings) for (const s of f.safer) { if (!s.cmd || f.severity === 'info') continue; const k = s.cmd; if (sk.has(k)) continue; sk.add(k); sv.push(Object.assign({ finding: f.title, severity: f.severity }, s)); }
      sv.sort((x, y) => (y.derived ? 1 : 0) - (x.derived ? 1 : 0) || sIdx(y.severity) - sIdx(x.severity));
      a.safer = sv;
      a.saferNotes = [];
      for (const f of a.findings) for (const s of f.safer) if (!s.cmd && s.why) a.saferNotes.push({ finding: f.title, why: s.why });

      // entry-level safer suggestions (static, from data)
      a.entrySafer = [];
      for (const s of all) { const e = s.entryId && byId.get(s.entryId); if (e) for (const sp of e.safer) a.entrySafer.push({ from: e.name, cmd: sp.cmd, why: sp.why }); }

      // related
      a.related = [];
      const rel = new Set();
      for (const s of a.segments) { const e = s.entryId && byId.get(s.entryId); if (e) for (const sg of e.suggestions) { if (!rel.has(sg)) { rel.add(sg); a.related.push(resolveSuggestion(sg)); } } }
      a.entryIds = Array.from(new Set(all.map((s) => s.entryId).filter(Boolean)));
      return a;
    }

    function collectSegments(a) {
      const out = [];
      (function walk(x) { for (const s of x.segments) { out.push(s); for (const inn of s.inner) walk(inn); } })(a);
      return out;
    }

    function chainMeaning(op) {
      switch (op) {
        case null: return 'Starts here.';
        case '|': return 'Pipe: the previous command’s output becomes this command’s input. The pipeline’s exit status is the last command’s (unless `set -o pipefail`).';
        case '|&': return 'Pipe: previous output and errors both feed this command.';
        case '&&': return 'Runs only if the previous command succeeded (exit status 0).';
        case '||': return 'Runs only if the previous command failed.';
        case ';': return 'Runs next regardless of whether the previous command succeeded.';
        case '&': return 'The previous command runs in the background; this one starts immediately.';
        default: return '';
      }
    }

    function resolveSuggestion(s) {
      const e = byName.get(String(s).toLowerCase()) || byId.get(slugify(s));
      return e ? { name: e.name, id: e.id, link: true } : { name: s, id: null, link: false };
    }

    /* ── reverse mode ── */
    const STOP = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'my', 'me', 'i', 'want', 'need', 'how', 'do', 'can', 'you', 'please', 'with', 'for', 'and', 'is', 'are', 'it', 'that', 'this', 'which', 'what', 'all']);
    const stem = (w) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w);
    function tokensOf(text) { return String(text).toLowerCase().split(/[^a-z0-9_.\/@:-]+/).filter(Boolean); }

    const EXTRACT = {
      size: (t) => { const m = /(\d+(?:\.\d+)?)\s*(tb|gb|mb|kb|t|g|m|k)b?\b/i.exec(t); if (!m) return null; const u = m[2][0].toUpperCase(); return m[1] + (u === 'K' ? 'k' : u); },
      days: (t) => { const m = /(\d+)\s*(?:days?|d)\b/i.exec(t); return m ? m[1] : null; },
      hours: (t) => { const m = /(\d+)\s*(?:hours?|hrs?|h)\b/i.exec(t); return m ? m[1] : null; },
      minutes: (t) => { const m = /(\d+)\s*(?:minutes?|mins?)\b/i.exec(t); return m ? m[1] : null; },
      lines: (t) => { const m = /(\d+)\s*lines?\b/i.exec(t) || /\b(?:top|first|last|head|tail)\s+(\d+)\b/i.exec(t); return m ? m[1] : null; },
      path: (t) => { const m = /(?:^|\s)((?:~|\.{1,2})?\/[\w.@%+~\/-]*)/.exec(t); return m ? m[1].replace(/[.,;:)]+$/, '') : null; },
      port: (t) => { const m = /\bport\s*:?\s*(\d{1,5})\b/i.exec(t) || /:(\d{2,5})\b/.exec(t); return m ? m[1] : null; },
      namespace: (t) => { const m = /\b(?:namespace|ns)\s+([a-z0-9][a-z0-9-]*)/i.exec(t) || /\bin\s+([a-z0-9][a-z0-9-]*)\s+namespace\b/i.exec(t); return m ? m[1] : null; },
      name: (t) => { const m = /\b(?:named|called|name)\s+["']?([^\s"']+)["']?/i.exec(t); return m ? m[1] : null; },
      ext: (t) => { const m = /\*?\.([a-z0-9]{1,6})\b(?!\/)/i.exec(t.replace(/\b\d+\.\d+\b/g, '')) || /\b([a-z0-9]{2,5})\s+files?\b/i.exec(t); return m && !/^(all|the|my|big|large|old|new|log)$/i.test(m[1]) || (m && m[1].toLowerCase() === 'log') ? m[1].toLowerCase() : null; },
      user: (t) => { const m = /\b(?:user|owner|username|account)\s+["']?([a-z_][a-z0-9_-]*)/i.exec(t); return m ? m[1] : null; },
      host: (t) => { const m = /\b[\w.-]+@[\w.-]+\b/.exec(t) || /\b(?:host|server|machine)\s+([\w.-]+)/i.exec(t) || /\b(\d{1,3}(?:\.\d{1,3}){3})\b/.exec(t); return m ? (m[1] || m[0]) : null; },
      pid: (t) => { const m = /\bpid\s*(\d+)/i.exec(t) || /\bprocess\s+(\d+)/i.exec(t); return m ? m[1] : null; },
      text: (t) => { const q = /["“']([^"”']{1,60})["”']/.exec(t); if (q) return q[1]; const m = /\b(?:containing|contains|matching|word|text|string|for)\s+([\w.:-]+)\b/i.exec(t); return m && !/^(files?|all|any|the|my|this|that)$/i.test(m[1]) ? m[1] : null; },
      url: (t) => { const m = /https?:\/\/[^\s"']+/.exec(t); return m ? m[0] : null; },
      file: (t) => { const m = /\b([\w-]+(?:\.[A-Za-z0-9]{1,6})+)\b/.exec(t.replace(/https?:\/\/[^\s]+/g, '')); return m ? m[1] : null; },
      image: (t) => { const m = /\bimage\s+([\w.\/:-]+)/i.exec(t); return m ? m[1] : null; },
      pod: (t) => { const m = /\b(?:pod|container|deployment|service|statefulset|node)\s+(?:named\s+)?([a-z0-9][\w.-]*)/i.exec(t); return m && !/^(in|on|for|with|that|which|named|called|logs?|status|is|are|crashing|failing|failed|stuck|pending|not|keeps|restarting|running|crashes|down|broken|to|and|from|using|has|have|was|will|use|uses|my|the|a|an)$/i.test(m[1]) ? m[1] : null; },
      branch: (t) => { const m = /\bbranch\s+(?:named\s+)?([\w.\/-]+)/i.exec(t); return m ? m[1] : null; },
      tag: (t) => { const m = /\btag\s+(?:named\s+)?([\w.\/-]+)/i.exec(t); return m ? m[1] : null; },
      service: (t) => { const m = /\b(?:service|unit|daemon)\s+(?:named\s+)?([\w.@-]+)/i.exec(t) || /\b(nginx|apache2?|httpd|sshd?|docker|mysql|mysqld|postgres(?:ql)?|redis|kubelet|containerd|cron|chronyd|firewalld)\b/i.exec(t); return m ? m[1] : null; },
      number: (t) => { const m = /\b(\d+)\b/.exec(t); return m ? m[1] : null; },
      database: (t) => { const m = /\b(?:database|db|schema)\s+(?:named\s+)?([\w-]+)/i.exec(t); return m ? m[1] : null; },
      region: (t) => { const m = /\b((?:us|eu|ap|sa|ca|me|af)-[a-z]+-\d)\b/i.exec(t); return m ? m[1] : null; },
      bucket: (t) => { const m = /\b(?:bucket)\s+(?:named\s+)?([a-z0-9][a-z0-9.-]{2,})/i.exec(t) || /s3:\/\/([a-z0-9][a-z0-9.-]+)/i.exec(t); return m ? m[1] : null; },
    };

    function phraseMatch(q, qWords, qStems, k) {
      if (k.includes(' ')) return q.includes(k);
      const ks = stem(k);
      return qWords.includes(k) || qStems.includes(ks);
    }

    function reverse(text, opts) {
      opts = opts || {};
      const limit = opts.limit || 5;
      const q = String(text || '').toLowerCase().trim();
      if (!q) return [];
      const qWords = tokensOf(q);
      const qStems = qWords.map(stem);
      const res = [];
      for (const it of intents) {
        const groups = it.match || [];
        if (!groups.length) continue;
        let hit = 0, kwHits = 0;
        for (const g of groups) {
          let gh = false;
          for (const k of g) if (phraseMatch(q, qWords, qStems, String(k).toLowerCase())) { gh = true; kwHits++; }
          if (gh) hit++;
        }
        const need = it.min != null ? it.min : Math.max(1, Math.ceil(groups.length * 0.66));
        if (hit < need) continue;
        let score = (hit / groups.length) * 10 + Math.min(kwHits, 6) * 0.3 + (it.weight || 0);
        for (const sayPhrase of it.say || []) {
          const sp = String(sayPhrase).toLowerCase();
          if (q.includes(sp)) score += 4;
          else {
            const sw = tokensOf(sp).filter((w) => !STOP.has(w)).map(stem);
            if (sw.length) score += (sw.filter((w) => qStems.includes(w)).length / sw.length) * 1.5;
          }
        }
        // slots
        const vals = {}; const missing = [];
        for (const [name, spec] of Object.entries(it.slots || {})) {
          const ex = EXTRACT[spec.from || name];
          let v = ex ? ex(text) : null;
          if (v == null || v === '') { if (spec.default != null) v = spec.default; else { v = '<' + (spec.label || name) + '>'; missing.push(spec.label || name); } }
          vals[name] = v;
        }
        const fill = (tpl) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (k in vals ? vals[k] : m));
        const cmd = fill(it.cmd);
        res.push({
          id: it.id, title: it.title, cmd, score, missing,
          notes: it.notes || '', alts: (it.alts || []).map((a) => ({ cmd: fill(a.cmd), desc: a.desc || '' })),
          category: it.category || '',
        });
      }
      res.sort((a, b) => b.score - a.score);
      const out = []; const seen = new Set();
      for (const r of res) { if (seen.has(r.cmd)) continue; seen.add(r.cmd); out.push(r); if (out.length >= limit) break; }
      if (opts.analyze !== false) for (const r of out) r.analysis = analyze(r.cmd);
      return out;
    }

    /* ── helpers for UI ── */
    function completions(prefix, n) {
      const p = String(prefix || '').toLowerCase();
      if (!p) return [];
      const out = [];
      for (const e of entries) { if (e.kind !== 'topic' && e.name.toLowerCase().startsWith(p)) out.push(e.name); if (out.length >= (n || 12)) break; }
      return out;
    }

    function toMarkdown(a) {
      const L = [];
      L.push('### `' + a.input.replace(/\n/g, ' ⏎ ') + '`');
      L.push('');
      L.push('**Risk:** ' + a.risk.toUpperCase() + (a.riskBumped ? ' (raised from ' + a.baseRisk + ' by production / blast-radius signals)' : ''));
      L.push('');
      if (a.isChain) { L.push('**Flow**'); a.chain.forEach((c, i) => L.push((i + 1) + '. `' + c.text + '` — ' + c.meaning)); L.push(''); }
      for (const s of a.segments) {
        L.push('**`' + (s.cmdline || s.text) + '`**' + (s.entrySummary ? ' — ' + s.entrySummary : ''));
        for (const t of s.tokens) L.push('- `' + t.part + '` (' + t.type + '): ' + t.desc);
        L.push('');
      }
      if (a.findings.filter((f) => f.severity !== 'info').length) {
        L.push('**Warnings**');
        for (const f of a.findings) if (f.severity !== 'info') L.push('- [' + f.severity + '] **' + f.title + '** — ' + f.message);
        L.push('');
      }
      if (a.safer.length) { L.push('**Safer alternatives**'); for (const s of a.safer) L.push('- `' + s.cmd + '` — ' + s.why); L.push(''); }
      L.push('_Generated by Linux Command Explainer — https://linux-command-explainer.eknathalabs.com_');
      return L.join('\n');
    }

    return {
      entries, byId, byName, categories, intents, rules, signals,
      lookup, findEntry, analyze, reverse, completions, toMarkdown, resolveSuggestion,
      extractorNames: Object.keys(EXTRACT),
      lex, slugify, stats() {
        const by = {};
        for (const e of entries) by[e.risk] = (by[e.risk] || 0) + 1;
        return { commands: entries.length, risks: by, rules: rules.length, signals: signals.length, intents: intents.length };
      },
    };
  }

  return { create, lex, segmentize, slugify, expandMacros, RISK, SEV };
});
