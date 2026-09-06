# Writerer — AI writing coach & critique group

A local-first web app that turns any LLM into an exacting writing coach. Upload the **guidelines, samples, templates and rubrics** for a task, state the **assignment**, paste your **draft** — then have the coach analyze, critique, line-edit, score, or rewrite it *against those references*.

Everything runs in the browser. Documents never leave your machine except as context in the LLM call you configure; API keys live only in `localStorage`.

## Features

- **Reference-grounded coaching.** Every document you add is labeled (`guideline` / `sample` / `template` / `reference` / `draft`) and injected as tagged context. Rubrics and word limits are treated as binding.
- **Six coaching modes**
  - *Analyze* — structure map, argument/evidence audit, gap list vs. the task
  - *Critique* — what works, the three problems that matter, the one next step
  - *Line edit* — original → edited pairs with reasons, plus your recurring habits
  - *Evaluate* — scored rubric table derived from your guidelines, with how-to-reach-5
  - *Rewrite* — publication-ready rewrite + changelog, one click to adopt as your draft
  - *Critique group* — every enabled reader critiques in turn, then a workshop leader synthesizes a prioritized revision plan
- **Editable critique group.** Developmental Editor, Line Editor, Target Reader, Rubric Hawk, Skeptic — rename them, rewrite their briefs, add your own.
- **Free-form chat** with the coach, with the full project context attached.
- **Any provider**: OpenRouter, Google Gemini, Groq, Cerebras, NVIDIA NIM, GitHub Models, Mistral, OpenAI, Anthropic, Ollama, LM Studio, any OpenAI-compatible endpoint, and fully offline in-browser **WebGPU** models via WebLLM. Responses stream token by token.
- **Import** PDF, DOCX, Markdown, plain text, HTML, RTF, CSV, JSON — **paste a URL** to pull in a blog post, style guide or docs page, or **paste raw text** straight from the clipboard as a note. **Export** any draft or piece of feedback as Markdown, TXT, DOCX, PDF or HTML.
- **A writing environment, not a form.** Three panels — sources, editor, coach — each independently **toggleable and drag-resizable**. Your layout persists.
- **Outline navigation** in the left margin, Left-style: Markdown headings listed with per-section word counts, click to jump, current section highlighted as you type.
- **Live Markdown preview**, on by default: a split view that renders as you type, with scroll sync in both directions. Four modes toggled from the tab bar (`⌘P` cycles write/split):
  - `write` — Markdown source only
  - `split` — source + live render (default)
  - `rich` — **edit directly in the rendered view** (WYSIWYG)
  - `read` — rendered page, read-only
- **Rich editing is non-destructive.** Only the block you actually edit is converted back from HTML to Markdown and spliced in by offset; every other byte of your source is preserved exactly — no reformatted bullets, emphasis markers or escaping. Code blocks and tables can't survive an HTML round-trip faithfully, so those open a small source editor instead.
- **Focus mode** (`⌘\`) strips everything but the page. Plus typewriter scrolling, serif/mono toggle and text size controls.
- **Agent Skills.** Portable `SKILL.md` procedures the coach *executes* rather than just answers with: it reads your draft, searches your sources, makes targeted edits and verifies them in a loop. Three built in (rubric audit, line-edit pass, structural diagnosis); import or author your own. Tool access is whitelistable per skill and enforced. See **[SKILLS.md](SKILLS.md)**.
- Auto-saves your project to `localStorage`.

### Keyboard

| Shortcut | Action |
|---|---|
| `⌘/Ctrl + \` | Focus mode (Esc to exit) |
| `⌘/Ctrl + 1` | Toggle sources panel |
| `⌘/Ctrl + 2` | Toggle coach panel |
| `⌘/Ctrl + 0` | Toggle outline |
| `⌘/Ctrl + P` | Toggle live preview |
| `⌘/Ctrl + ,` | Settings |
| `⌘/Ctrl + ↵` | Send to the coach |

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static bundle in dist/
```

## Configuring a provider

Open **⚙ Settings**, pick or add a provider, paste a key if needed, then hit **Test / fetch models** to populate the model list.

### Provider matrix

Writerer is backendless, so every call is made **by your browser**. That means the endpoint must send CORS headers permitting this page's origin. Each provider carries a badge in Settings:

| Provider | Free tier | Browser-ready | Base URL |
|---|---|---|---|
| **OpenRouter** | yes (`:free` models) | ✅ | `https://openrouter.ai/api/v1` |
| **Google Gemini** | yes, generous | ✅ | `https://generativelanguage.googleapis.com/v1beta/openai` |
| **Groq** | yes | ✅ | `https://api.groq.com/openai/v1` |
| **Cerebras** | yes | ✅ | `https://api.cerebras.ai/v1` |
| **OpenAI** | no | ✅ | `https://api.openai.com/v1` |
| **Anthropic** | no | ✅ | `https://api.anthropic.com/v1` |
| **NVIDIA NIM** | free credits | ⚠️ may need proxy | `https://integrate.api.nvidia.com/v1` |
| **GitHub Models** | yes, PAT-limited | ⚠️ may need proxy | `https://models.github.ai/inference` |
| **Mistral** | yes | ⚠️ may need proxy | `https://api.mistral.ai/v1` |
| **WebGPU (WebLLM)** | free & private | ✅ no network | — |
| **Ollama / LM Studio** | free & local | ⚙️ needs CORS setup | `http://localhost:11434/v1` · `:1234/v1` |

GitHub Models needs a PAT with the **`models:read`** scope. Gemini keys come from [AI Studio](https://aistudio.google.com/apikey).

### Importing references from the web

Paste a URL into the reference panel (or drag a link in from another tab) to add a blog post, style guide or documentation page as reference material. Nav bars, headers, footers, sidebars, cookie notices and comment threads are stripped; headings, lists, tables, quotes and code survive as Markdown. Linked PDFs are detected and parsed as PDFs.

Because Writerer has no backend, the browser cannot fetch most sites directly — they don't send CORS headers. So it tries several routes in order and keeps the first that yields usable text:

1. **Direct fetch** — works for CORS-open sites (raw.githubusercontent.com, most APIs, many docs sites)
2. **`r.jina.ai`** — a reader service that returns clean Markdown
3. **Generic CORS proxies** — `allorigins`, `corsproxy.io`, `codetabs`, whose HTML is converted locally

Imported documents keep a link back to their source, and the model is told the URL so it can cite it.

**Privacy:** when a fallback route is used, the URL you're importing passes through that third-party service. Nothing else about your project is sent. If that matters, import sensitive material as a file instead.

Pages behind a login, hard bot-blocking, or pure client-side JavaScript rendering may still fail — the error lists what was tried. Workaround: copy the text and paste it in, or save the page as PDF and upload that.

### Pasting a source or note

**📋 Paste text** opens a note editor for anything you can't upload or fetch: a paywalled or login-walled page, text copied out of a PDF viewer or an email, an editor's feedback, or your own working notes. Hit *Paste from clipboard*, or just Ctrl/Cmd+V into the box.

The title is derived from the first meaningful line if you leave it blank, and you can attach an optional source URL for attribution. Pasting multi-line text into the *URL* field opens this editor automatically, since it clearly isn't a link.

Every reference — uploaded, fetched or pasted — has an **Edit** button that reopens it here, so you can trim boilerplate out of a long import and leave more context budget for what actually matters.

### Fixing the Ollama CORS error

> Access to fetch at `http://localhost:11434/...` has been blocked by CORS policy

Ollama only answers browser requests from origins it has been told to trust. Quit Ollama fully, then relaunch it allowing the page's origin:

```bash
# terminal-launched
OLLAMA_ORIGINS=https://bashmaester.github.io ollama serve

# macOS menubar app
launchctl setenv OLLAMA_ORIGINS "https://bashmaester.github.io"
# then quit and reopen Ollama

# Windows: add a user env var OLLAMA_ORIGINS with that value, restart from the tray
```

Use `http://localhost:5173` instead when running the dev server. Settings shows a copy-paste command with your current origin already filled in. `OLLAMA_ORIGINS=*` works too but lets *any* website reach your local models — prefer the exact origin.

For **LM Studio**, start the local server and toggle CORS on in its server settings.

Note that `localhost` is exempt from the browser's mixed-content rule, so local models do work from the HTTPS site once CORS is configured.

The **Context budget** slider caps how many characters of reference material are sent per request; oversized documents are trimmed head-and-tail. Lower it for small-context models.

## Stack

React 19 + TypeScript + Vite. `pdfjs-dist` and `mammoth` for import, `docx` / `jspdf` / `marked` for export, `@mlc-ai/web-llm` for in-browser inference. No backend.
