# 🐧 Linux Command Explainer

Paste any Linux, Kubernetes, Docker, Git, Terraform or cloud CLI command and get a **breakdown, a risk level, production warnings and a safer dry-run version of your command**. Or describe what you want in plain English and get the command.

🌐 **Live:** https://linux-command-explainer.eknathalabs.com · built by [EknathaLabs](https://eknathalabs.com)

## What it does

| | |
|---|---|
| **Explain** | Token-by-token breakdown with per-flag meaning, including pipes (`\|`), `&&`/`\|\|`/`;`, redirections, `$(…)`, `bash -c`, `ssh host "…"`, `sudo`, `xargs`, `kubectl exec -- …` |
| **Risk + cautions** | low / medium / high / **critical**, with plain-language cautions on every medium/high command and on dangerous flags |
| **Safer version** | Rewrites *your* command into a dry-run or less destructive form (`kubectl delete … --dry-run=server`, `rsync -n`, `find … -print` instead of `-delete`, `git push --force-with-lease`, …) |
| **Production awareness** | Detects `prod`/`production` targets, `-A`/`--all`, `--force`, `-y`/`--auto-approve`, wildcard deletes on system paths, world-open rules, `:latest`… and raises the risk level |
| **Describe → command** | ~130 recipes (“find files larger than 500MB”, “why is my pod crashing”) with slots filled from your sentence; every suggestion is risk-checked too |
| **Reference pages** | One static page per command (`/cmd/<name>/`) with flags, examples, risks and FAQ markup; category pages and a sitemap |
| **Shareable** | `?cmd=` and `?d=` permalinks, copy link, copy as Markdown |

~630 entries across 16 categories (files, text, system, storage, security, networking, shell, Kubernetes, containers, Git, IaC, cloud, databases, observability, packages, services). All analysis runs in the browser and works offline; only the GitHub star count and visitor counter use the network.

> The analysis is rule-based and can miss things. Read the command, test on non-production and keep backups.

## Develop

```bash
npm run check     # validate data → build site → run tests
npm run serve     # http://localhost:8080
npm run new -- "ethtool" networking
```

Node ≥ 18, zero dependencies. The site is **generated**: edit `data/` (or `src/`), run `npm run build`, commit the output (GitHub Pages serves the repo root).

```
data/commands/*.json   command reference (one file per category)
data/rules/*.json      safety rules + production signals
data/intents/*.json    "describe → command" recipes
src/engine.js          parser, rules, safer-version, reverse mode (browser + Node)
src/app.js, style.css  UI
scripts/               validate · build · new-command · serve
tests/                 node:test suites
```

See [CONTRIBUTING.md](CONTRIBUTING.md) to add commands, safety rules or recipes. CI runs validate + build + tests and fails if generated files are stale.

## License

MIT
