# Contributing

The site is generated from JSON in `data/`. You never edit the HTML by hand.

```bash
git clone https://github.com/eknatha/linux-command-explainer && cd linux-command-explainer
npm run new -- "ethtool" networking   # scaffold a command (fills TODOs for you)
npm run check                          # validate + build + test
npm run serve                          # http://localhost:8080
```

Requires Node ≥ 18. There are no dependencies to install.

## Adding a command — `data/commands/<category>.json`

| field | required | notes |
|---|---|---|
| `name` | yes | `kubectl delete` style names are fine; they get their own page `/cmd/kubectl-delete/` |
| `summary`, `explanation` | yes | summary ≤ 200 chars; explanation ≥ 40 chars |
| `risk` + `risk_reason` | yes | `low`, `medium` or `high` |
| `cautions` | **medium/high** | what can go wrong, in plain sentences. The validator fails without it. |
| `safer` | recommended for high | `{cmd, why}` — a dry-run or less destructive form |
| `flags`, `examples` | yes | add `caution` to a flag that is dangerous |
| `low_when` / `low_unless` | optional | regexes so read-only uses (`systemctl status`) are not shown as risky |

Risk guide: **low** = read-only or easily reversed; **medium** = changes state, recoverable with effort; **high** = data loss, outage, lockout or security exposure.

## Adding a safety rule — `data/rules/*.json`

Rules fire on the *whole* command line (pipes, `ssh host "…"`, `bash -c`, `$(…)` included).

```json
{ "id": "my-rule", "severity": "high", "scope": "segment", "cmd": ["rsync"],
  "when": ["--delete"], "not": ["(?:-n|--dry-run)"],
  "title": "rsync --delete removes files at the destination",
  "message": "…",
  "safer": [{ "find": "rsync ", "replace": "rsync -n ", "why": "Dry run first" }] }
```

* `find`/`replace` produces a derived “safer version of **your** command”.
* `severity`: info, low, medium, high, critical.
* Production signals (`prod.signals`) raise the risk level when a command targets something named `prod`, uses `-A`/`--all`, `--force`, `-y`, wildcards on system paths, etc.

## Adding a “describe → command” recipe — `data/intents/*.json`

`match` is a list of keyword groups (a query must hit most groups), `say` are example phrasings, `slots` pull values out of the sentence (size, days, path, port, namespace, pod, service, user, host, …) and `cmd` is the template. Prefer **preview/dry-run** forms (`-print` before `-delete`).

## Pull request checklist

`npm run check` must pass and the generated files must be committed (CI fails otherwise). Keep examples copy-pasteable and non-destructive by default.
