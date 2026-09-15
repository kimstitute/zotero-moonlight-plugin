<a id="top"></a>

<p align="center">
  <img src="addon/content/icons/icon-256.png" width="152" height="152" alt="Zotero Moonlight — a glossy red Z on a golden moon">
</p>

<h1 align="center">Zotero Moonlight</h1>

<p align="center">
  <strong>Your library in Zotero. Your reading in Moonlight.</strong><br>
  Open papers from their online addresses — even without a local PDF attachment.
</p>

<p align="center">
  <a href="dist/zotero-moonlight-0.2.1.xpi?raw=true"><img src="https://img.shields.io/badge/version-0.2.1-7c3aed?style=flat-square" alt="Version 0.2.1"></a>
  <img src="https://img.shields.io/badge/Zotero-9.0.x-cc2936?style=flat-square" alt="Zotero 9.0.x">
  <img src="https://img.shields.io/badge/tested_on-Windows-2563eb?style=flat-square" alt="Tested on Windows">
  <img src="https://img.shields.io/badge/built_with-TypeScript-3178c6?style=flat-square" alt="Built with TypeScript">
</p>

<p align="center">
  <a href="dist/zotero-moonlight-0.2.1.xpi?raw=true"><strong>Download plugin · v0.2.1</strong></a>
  &nbsp;·&nbsp; <a href="#quick-start">Quick start</a>
  &nbsp;·&nbsp; <a href="docs/README.ko.md">한국어</a>
  &nbsp;·&nbsp; <a href="#questions">FAQ</a>
</p>

---

## Overview

Choose a paper in Zotero, then read it with your Moonlight account. Right-click to open it in a **Zotero tab** or in **Chrome / Edge**.

The plugin starts with the paper's online address. Direct PDF links and arXiv records can open immediately; for other sources, it looks for an explicit PDF link on the publisher's page. You can also connect a Zotero item to a Moonlight document you already use.

**Choose a paper → Find its online PDF → Read in Moonlight**

> [!NOTE]
> This is an unofficial integration. Moonlight handles login, subscriptions, and AI features. No API key is required. **Zotero's internal tab uses the Moonlight website and does not require the Chrome extension.**

<p align="center">
  <a href="#features">Features</a> &nbsp;·&nbsp;
  <a href="#quick-start">Installation</a> &nbsp;·&nbsp;
  <a href="#reading-modes">Reading modes</a> &nbsp;·&nbsp;
  <a href="#everyday-use">Usage</a> &nbsp;·&nbsp;
  <a href="#data-and-privacy">Data</a> &nbsp;·&nbsp;
  <a href="#development">Development</a>
</p>

## Features

| | What you get |
| :--- | :--- |
| **🌐 Read from a link** | Use a PDF link, arXiv URL, or DOI without attaching a local PDF first. |
| **🌙 Stay in Zotero** | Read in a tab with back, forward, reload, library, and external-browser controls. |
| **🧭 Choose your browser** | Open the source in Chrome or Edge and use its Moonlight extension. |
| **🔗 Connect a document** | Save a Moonlight document URL for a Zotero item and reuse it next time. |
| **📖 Resume an open tab** | Reopening the same paper selects its existing tab and preserves the reading position. |
| **📄 Use a fallback** | Open the publisher's page, or an already-local PDF when the fallback is enabled. |

## Quick start

### 1. Install

You need **Zotero 9.0.x**. Windows with Zotero 9.0.6 is the verified environment; macOS and Linux are unverified.

**[Download zotero-moonlight-0.2.1.xpi](dist/zotero-moonlight-0.2.1.xpi?raw=true)**, then open:

**Zotero → Tools → Plugins → ⚙ → Install Plugin From File…**

Choose the downloaded `.xpi`. In Korean Zotero: **도구 → 플러그인 → ⚙ → 파일에서 플러그인 설치…**. Install over an existing version to update it. Updates are currently manual.

Use the `.xpi` for installation. GitHub's source ZIP is for development.

### 2. Choose where to read

Open **Tools → Moonlight 설정…** and set **기본 열기 방식**:

| Option | Setup |
| :--- | :--- |
| **Zotero 내부 탭에서 열기** | Sign in to Moonlight inside Zotero when prompted. No browser extension is required. |
| **Chrome / Edge에서 열기** | Install Moonlight's extension in your chosen browser and sign in there. Select Chrome or Edge in settings. |

Click **저장** to save, or **저장하고 Moonlight 열기** to save and open Moonlight. External browser mode is the initial default.

### 3. Open a paper

Select **one paper** in Zotero, then right-click:

**Moonlight → Moonlight로 읽기**

The item needs a usable URL, DOI, or online attachment link. An arXiv abstract URL, for example, resolves to an online PDF without a local attachment.

Plugin menu labels are currently in Korean, including in an English Zotero interface. This guide uses the exact labels you will see.

## Reading modes

| | Zotero tab | External browser |
| :--- | :--- | :--- |
| **Reader** | Moonlight website inside Zotero | Chrome / Edge with Moonlight extension |
| **Login** | Sign in within Zotero | Selected browser profile's login |
| **Browser extension** | Not required | Required for Moonlight's PDF integration |
| **Open directly** | `Zotero 탭에서 읽기` | `브라우저에서 읽기` |
| **If loading fails** | Use the tab's `브라우저에서 열기` button | Open the publisher page and check access there |

**Login sessions are separate.** Signing in to Chrome does not sign in to Zotero's internal tab.

Internal tabs last for the current Zotero session and are not restored after a restart. Saved document connections remain available.

## Everyday use

| I want to… | Choose under **Moonlight** |
| :--- | :--- |
| Use my default reading mode | **Moonlight로 읽기** |
| Read inside Zotero this time | **Zotero 탭에서 읽기** |
| Read in Chrome / Edge this time | **브라우저에서 읽기** |
| Retry the source instead of a saved document | **원문에서 다시 열기** |
| Connect, replace, or clear a document link | **Moonlight 문서 연결…** |

The Zotero PDF reader's context menu also provides Moonlight commands. A PDF attachment with a parent item uses the parent paper's metadata.

### Connect a document you already read

1. Copy the **document's web URL** from Moonlight.
2. Select its paper in Zotero → **Moonlight → Moonlight 문서 연결…**.
3. Paste the URL and confirm.

The saved link takes priority next time. To disconnect it, open the same dialog, clear the field, and confirm. Use a document URL, rather than a homepage or login URL.

### Configure an external browser

The plugin detects standard Windows Chrome and Edge installations. If detection fails, use **찾아보기** in settings to choose the browser executable.

Leave **브라우저 프로필 폴더** blank for the browser's normal behavior. To select a profile, enter its folder name, such as `Default` or `Profile 1`, rather than its display name.

If Chrome shows its regular PDF viewer, click the **Moonlight switch button at the lower left**.

## Questions

<details>
<summary><strong>Does this work without an attached PDF?</strong></summary>

Yes, when the record has a usable online source. Direct PDF links and arXiv URLs are supported. For publisher pages and DOIs, the plugin looks for explicit PDF metadata. It cannot find a PDF on every site or bypass access restrictions.

</details>

<details>
<summary><strong>Can I use my Moonlight subscription?</strong></summary>

Sign in to your Moonlight account in the chosen reading environment. Moonlight applies the account's available features. Google sign-in popups and subscription AI features inside Zotero still need further manual verification; use the external browser if they do not work.

</details>

<details>
<summary><strong>What if the paper requires institutional login?</strong></summary>

Use the source-page fallback to open the publisher in your browser, complete its access flow, and open the PDF there. The plugin's metadata lookup does not reuse browser login cookies.

</details>

<details>
<summary><strong>What if I only have a local PDF?</strong></summary>

Enable **온라인 주소가 없으면 로컬 PDF 열기** in settings. The plugin opens an already-local attachment in the external browser; Moonlight's extension may need permission to access file URLs. If that fails, use Moonlight's web upload. The fallback does not download cloud-only Zotero attachments.

</details>

<details>
<summary><strong>Does it synchronize notes or annotations?</strong></summary>

No. This version opens documents and remembers manually connected URLs. Importing Moonlight notes, synchronizing annotations, and automatically finding existing Moonlight documents are not implemented.

</details>

## Data and privacy

- Browser preferences and manually connected document URLs stay in the local Zotero profile. This plugin does not synchronize them across devices.
- The plugin does not extract account credentials or transfer login cookies between browsers and Zotero.
- Opening a paper sends its online URL to the selected browser or Moonlight's web reader. Metadata lookup contacts the source site; Moonlight handles its own document processing.
- Original Zotero metadata, notes, and attachments are not rewritten.
- Tests use synthetic items and public sample URLs. Local profiles, personal libraries, credentials, and execution logs are excluded from publication.

## Development

**Requirements:** Node.js 24+ and Python 3. TypeScript is a development dependency; the plugin has no bundled third-party runtime dependencies.

From the repository root:

```sh
npm ci --ignore-scripts
npm run check
```

This runs type checking, **27 automated tests**, bundle syntax validation, and packaging. The build writes the XPI and its checksum to `dist/`.

<details>
<summary><strong>Project structure</strong></summary>

```text
zotero-moonlight-plugin/
├── addon/                 # Manifest, bootstrap, settings UI, icons
├── assets/                # Logo artwork
├── dist/                  # Installable XPI and SHA256SUMS
├── docs/                  # Korean guide and compatibility notes
├── scripts/               # Build, package, isolated Zotero checks
├── src/
│   ├── core.ts            # URL resolution and document-link validation
│   ├── internal-tabs.ts   # Embedded reader tabs and lifecycle
│   └── plugin.ts          # Zotero menus, preferences, browser launch
└── tests/                 # Automated tests and Zotero test harness
```

</details>

<details>
<summary><strong>Run the isolated Zotero checks on Windows</strong></summary>

Build first, then run:

```powershell
node scripts/prepare-smoke.mjs
.\scripts\run-smoke.ps1
```

These scripts create a separate profile under `work/` and use the standard Windows Zotero installation path. The test instance exits when the checks complete. Your existing library is not used. Keep generated profiles and logs out of commits.

</details>

**Validation:** 27 automated tests and 24 checks in an isolated Zotero 9.0.6 instance passed for v0.2.1. See [compatibility and remaining checks](docs/compatibility.md) for the limits of this verification.

## Contributing

For a bug report, include plugin and Zotero versions, operating system, reading mode, and steps using a public sample paper. Remove account details, private document URLs, signed links, and personal paths before sharing logs or screenshots.

For code changes, run `npm run check` and explain the resulting behavior. Areas for further work include login compatibility, broader platform testing, and publisher-specific PDF discovery.

---

<p align="center">
  An unofficial integration for <a href="https://www.zotero.org/">Zotero</a> and <a href="https://www.themoonlight.io/">Moonlight</a>.<br>
  README layout inspired by <a href="https://github.com/eli64s/readme-ai">ReadmeAI</a>.<br><br>
  <a href="#top">Back to top ↑</a>
</p>
