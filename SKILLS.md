# Writerer Skills

Skills are portable [Agent Skills](https://agentskills.io)-format procedures the coach executes against your document. A skill is a `SKILL.md` file: YAML frontmatter plus a Markdown body. Writerer runs them locally, driving its own editor through a tool API.

## Why this exists

The chat modes (critique, line edit, rewrite) are one-shot: the model sees a snapshot and answers. A skill is a **loop** — it reads the draft, searches your sources, makes a targeted edit, checks the result, and repeats until the procedure is done. That makes multi-step, verifiable work possible: audit every rubric requirement, edit a long draft section by section, diagnose structure and save a plan.

## The format

```markdown
---
name: my-skill
description: What it does and when to use it. This is the routing signal.
version: 1.0.0
allowed-tools: [get_task, read_draft, replace_in_draft, add_note, finish]
---

# My skill

## Procedure
1. Call `get_task` to understand the assignment.
2. Call `read_draft` with `with_line_numbers: true`.
3. …
4. Call `finish` with a Markdown summary.

## Rules
- Be explicit about what to change and what to leave alone.
```

| Field | Required | Notes |
|---|---|---|
| `name` | yes | kebab-case, ≤64 chars |
| `description` | yes | ≤1024 chars; state *what* and *when* |
| `allowed-tools` | no | Whitelist. Omit to allow everything. **Enforced at execution**, not just advertised. |
| `version`, `author`, `license` | no | Metadata |

The editor validates all of this as you type and refuses to save an invalid skill.

## Tool API

The model calls tools by emitting one fenced block per turn:

````
```tool
{"tool": "read_draft", "args": {"with_line_numbers": true}}
```
````

This is **text-based on purpose**. Native function calling is unevenly supported across Ollama, LM Studio and WebLLM builds, so the protocol is plain text that any instruction-following model can produce. The parser also accepts ` ```json ` fences, bare JSON objects, `name`/`arguments` aliases, and tolerates trailing commas — all common small-model slips.

### Read-only

| Tool | Purpose |
|---|---|
| `get_task` | Assignment, audience, and the list of sources |
| `read_draft` | Draft text; optional line numbers and line range |
| `get_outline` | Headings with per-section word counts |
| `get_stats` | Words, chars, lines, paragraphs, sentences, reading time |
| `read_source` | One reference document by name or id |
| `search_sources` | Search across included sources — cheaper than full reads |
| `search_draft` | Find lines by string or `/regex/` |

### Mutating

| Tool | Purpose |
|---|---|
| `replace_in_draft` | Exact-substring replace. Refuses ambiguous matches unless `all: true` |
| `replace_lines` | Replace an inclusive 1-based line range |
| `append_to_draft` | Append to the end |
| `set_draft` | Replace everything — for full rewrites only |
| `add_note` | Save a finding as a reference note the writer keeps |
| `finish` | End the run with a Markdown summary |

## Safety

- **`allowed-tools` is enforced.** A blocked call returns an error to the model instead of executing; verified by test.
- **Mutating tools are flagged** in the UI, and a skill that can change your draft says so before you run it.
- **Edits go through the normal editor state**, so they appear live and are part of your document history.
- `set_draft` refuses to blank the draft; `replace_in_draft` refuses ambiguous matches rather than guessing.
- Runs are **step-capped** (14 by default) and interruptible with **stop**.

## Running against local models

Skills work with any configured provider, including Ollama, LM Studio and in-browser WebGPU. Notes for small local models:

- The loop is designed for them: one tool call per turn, short prompts, explicit error messages that say how to recover.
- A failed `replace_in_draft` returns instructions to re-read with line numbers and copy the text exactly — models recover from this reliably.
- Very small models (≤3B) may skip steps or forget to call `finish`; the runner nudges once, then ends cleanly at the step cap with edits preserved.
- Give local models a larger context window if you can. Long drafts plus tool results add up.

## Authoring tips

- **The description is the routing signal.** Include the phrases a writer would actually say.
- **Number your steps** and name the exact tool at each one.
- **Say what not to do.** "Never alter quotations or citations" prevents more damage than any positive instruction.
- **Prefer many small edits** over one `set_draft`: they're verifiable, and a failure costs one sentence rather than the whole document.
- Keep the body under ~500 lines.

## Built-ins

| Skill | What it does |
|---|---|
| `rubric-audit` | Read-only. Extracts every requirement from your guidelines and produces a PASS/FAIL/PARTIAL/UNCLEAR compliance table with quoted evidence. |
| `line-edit-pass` | Edits the document. Works section by section, tightening prose while protecting voice, quotes and terminology. Saves a changelog. |
| `structural-diagnosis` | Read-only. Beat map, diagnosis against six structural failure modes, and a numbered restructuring plan. |

Built-ins ship with the app and refresh on load; **Duplicate & edit** to make your own version.
