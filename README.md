# ⚡ Linux Command Explainer

> **Instantly understand any Linux command — token breakdown, flags, real-world examples, risk level, and smart suggestions.**
> Built by [EknathaLabs](https://eknathalabs.com) · Built for Everyone.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-eknathalabs-00e5a0?style=for-the-badge&logo=github)](https://eknatha.github.io/linux-command-explainer/)
[![HTML](https://img.shields.io/badge/Built%20With-HTML%2FJS-f5a623?style=for-the-badge&logo=html5)](https://eknatha.github.io/linux-command-explainer/)
[![Offline](https://img.shields.io/badge/Works-100%25%20Offline-00e5a0?style=for-the-badge)](https://eknatha.github.io/linux-command-explainer/)
[![No API Key](https://img.shields.io/badge/No%20API%20Key-Required-4fc3f7?style=for-the-badge)](https://eknatha.github.io/linux-command-explainer/)
[![License: MIT](https://img.shields.io/badge/License-MIT-c084fc?style=for-the-badge)](LICENSE)

---

## 🖥️ Live Demo

**👉 [https://eknatha.github.io/linux-command-explainer/](https://eknatha.github.io/linux-command-explainer/)**

---

## 📸 Preview

```
$ tar -czf backup.tar.gz /var/log

┌─────────────────────────────────────────────────────┐
│  Summary        Archive and compress /var/log        │
│  Risk Badge     🟡 medium risk                       │
│  Tokens         tar | -czf | backup.tar.gz | /var/log│
│  Flags          -c create  -z gzip  -f filename      │
│  Examples       3 real-world copy-ready examples     │
│  Pro Tip        Exclude dirs with --exclude flag     │
│  Related        gzip · rsync · scp · find            │
└─────────────────────────────────────────────────────┘
```

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔍 **Command Lookup** | Type any Linux command and get an instant explanation |
| 🧩 **Token Breakdown** | Every part of the command labeled — base, flag, path, operator, variable |
| 🚩 **Flags Reference** | All short and long flags explained in a clean table |
| 📖 **How It Works** | 2–4 sentence technical explanation of behavior and side effects |
| 💡 **Real-World Examples** | 3 production-ready examples with one-click copy buttons |
| ⚡ **Pro Tips** | Expert-level gotchas and best practices for each command |
| 🎯 **Risk Badges** | 🟢 Low / 🟡 Medium / 🔴 High risk rating with reason tooltip |
| 🔗 **Related Commands** | Clickable suggestion chips — explore similar commands instantly |
| 📊 **Visitor Counter** | Live total visitors + visitors today — top-right of the page |
| ⌨️ **Quick-Try Chips** | 20+ pre-loaded example commands to explore instantly |
| 📱 **Responsive** | Works on desktop, tablet, and mobile |
| ✈️ **100% Offline** | Zero API calls, zero keys, zero backend — pure HTML/JS |

---

## 🗂️ Commands Covered (50+)

### File & Directory
`ls` `cd` `pwd` `cp` `mv` `rm` `mkdir` `find` `diff`

### Permissions & Users
`chmod` `chown` `useradd` `passwd`

### Text Processing
`grep` `awk` `sed` `sort`

### Archives & Compression
`tar` `gzip`

### Disk & Storage
`df` `du` `lsblk` `mount`

### Processes & System
`ps` `kill` `top` `uptime` `strace` `crontab` `systemctl` `journalctl` `hostnamectl`

### Networking
`ssh` `scp` `rsync` `curl` `wget` `ping` `dig` `ss` `netstat` `nmap` `tcpdump` `iptables` `lsof`

### Containers & Cloud
`docker` `kubectl`

### Security & Crypto
`openssl` `ssh-keygen`

### Version Control
`git`

> 🔮 **Unknown commands** fall back gracefully with `man`, `--help`, `tldr`, and `type` suggestions.

---

## 🚀 Getting Started

### Option 1 — Use the live site (no setup)

👉 [https://eknatha.github.io/linux-command-explainer/](https://eknatha.github.io/linux-command-explainer/)

### Option 2 — Run locally

```bash
# Clone the repo
git clone https://github.com/eknatha/linux-command-explainer.git

# Open in browser — no build step needed
cd linux-command-explainer
open index.html        # macOS
xdg-open index.html    # Linux
start index.html       # Windows
```

### Option 3 — Deploy your own fork

```bash
# Fork this repo on GitHub, then:
git clone https://github.com/YOUR_USERNAME/linux-command-explainer.git

# Make changes, push
git add . && git commit -m "my changes" && git push

# Enable GitHub Pages:
# Settings → Pages → Branch: main → Folder: / (root) → Save
```

Your site will be live at `https://YOUR_USERNAME.github.io/linux-command-explainer/`

---

## 🏗️ How It Works

This is a **single `index.html` file** — no framework, no build tool, no dependencies except Google Fonts.

```
index.html
├── <style>          Terminal-dark CSS (JetBrains Mono + Syne fonts)
├── <body>           Header, input, chips, result area, footer
└── <script>
    ├── KB {}        Offline knowledge base — 50+ commands
    ├── tokenize()   Smart command tokenizer (flags, paths, operators)
    ├── lookup()     Base-command matcher with sudo stripping
    ├── renderKnown()   Renders full card for known commands
    ├── renderUnknown() Fallback with man/tldr/--help suggestions
    └── countapi     Live visitor counter (countapi.xyz)
```

### Knowledge Base Structure

Each command entry in the `KB` object follows this schema:

```js
commandName: {
  summary:     "One-line description",
  risk:        "low" | "medium" | "high",
  risk_reason: "Why this risk level was assigned",
  explanation: "2-4 sentence deep-dive into how it works",
  flags: [
    { flag: "-x", long: "--example", desc: "What this flag does" }
  ],
  examples: [
    { cmd: "full command here", desc: "What this specific example does" }
  ],
  suggestions: ["related", "commands"],
  pro_tip: "One expert-level tip or gotcha"
}
```

---

## 🎨 Design

- **Theme:** Terminal-native dark — phosphor green on deep black
- **Fonts:** [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) (code) + [Syne](https://fonts.google.com/specimen/Syne) (headings)
- **Effects:** CSS grid overlay, scanline texture, green glow on focus
- **Animations:** `fadeUp` result reveal, `pulse` on visitor dot, hover transitions
- **Risk colors:** 🟢 `#00e5a0` · 🟡 `#f5a623` · 🔴 `#ff5f5f`

---

## 📊 Visitor Counter

The visitor counter uses **[countapi.xyz](https://countapi.xyz)** — a free, public counter API with no signup or backend required.

| Counter | Key | Behavior |
|---|---|---|
| Total Visitors | `eknathalabs/linux-explainer-total` | Increments on every page load |
| Visitors Today | `eknathalabs/linux-explainer-YYYY-MM-DD` | Increments per calendar day, auto-resets at midnight UTC |

---

## 🤝 Contributing

Contributions are welcome! The most impactful way to help is adding new commands to the knowledge base.

### Adding a new command

1. Fork this repo and open `index.html`
2. Find the `const KB = {` block in the `<script>` section
3. Add your command entry following the schema above
4. Also add a quick-try chip in the `.chip-row` div
5. Open a pull request with the title: `feat: add <commandname> to KB`

### Good first contributions

- [ ] Add `tmux`, `screen`, `watch`, `xargs`
- [ ] Add `ip`, `route`, `firewalld`, `ufw`
- [ ] Add `systemd-analyze`, `journalctl --vacuum`
- [ ] Add `ansible`, `terraform`, `helm`
- [ ] Add `jq`, `yq`, `xmllint`
- [ ] Improve mobile layout for long commands
- [ ] Add keyboard shortcut hints (Ctrl+K to focus input)

---

## 📁 Project Structure

```
linux-command-explainer/
├── index.html      # The entire app — single file
├── README.md       # This file
└── LICENSE         # MIT License
```

---

## 🔗 Related Projects by EknathaLabs

| Project | Description |
|---|---|
| 🔍 [GitHub Profile Analyzer](https://eknatha.github.io/github-profile-analyzer) | 100-point hirability score, contribution calendar, head-to-head comparison |
| ⚡ Linux Command Explainer | You are here |

---

## 👨‍💻 Author

**Eknatha Reddy** — Platform Engineer · Linux & Cloud Enthusiast

[![GitHub](https://img.shields.io/badge/GitHub-eknathareddyp-181717?style=flat-square&logo=github)](https://github.com/eknathareddyp)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-0A66C2?style=flat-square&logo=linkedin)](https://linkedin.com/in/eknathareddyp)
[![Website](https://img.shields.io/badge/Website-eknathalabs.com-00e5a0?style=flat-square)](https://eknathalabs.com)

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

Built with ♥ by [EknathaLabs](https://eknathalabs.com) · Built for Everyone

⭐ **Star this repo if it helped you learn Linux!**

</div>
