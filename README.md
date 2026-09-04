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
- **Any provider**: OpenRouter, OpenAI, Anthropic (Claude), Ollama, LM Studio, any OpenAI-compatible endpoint (vLLM, llama.cpp, LiteLLM, Groq…), and fully offline in-browser **WebGPU** models via WebLLM. Responses stream token by token.
- **Import** PDF, DOCX, Markdown, plain text, HTML, RTF, CSV, JSON. **Export** any draft or piece of feedback as Markdown, TXT, DOCX, PDF or HTML.
- Auto-saves your project to `localStorage`.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static bundle in dist/
```

## Configuring a provider

Open **⚙ Settings**, pick or add a provider, paste a key if needed, then hit **Test / fetch models** to populate the model list.

Because calls go directly from the browser, local engines must allow cross-origin requests:

| Engine | What to do |
|---|---|
| Ollama | `OLLAMA_ORIGINS=* ollama serve`, base URL `http://localhost:11434/v1` |
| LM Studio | Start the local server and enable CORS in its settings, base URL `http://localhost:1234/v1` |
| Anthropic | Works directly; the CORS opt-in header is sent for you |
| WebGPU | No server. First run downloads model weights (~2 GB) and caches them |

The **Context budget** slider caps how many characters of reference material are sent per request; oversized documents are trimmed head-and-tail. Lower it for small-context models.

## Stack

React 19 + TypeScript + Vite. `pdfjs-dist` and `mammoth` for import, `docx` / `jspdf` / `marked` for export, `@mlc-ai/web-llm` for in-browser inference. No backend.
