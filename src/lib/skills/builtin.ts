/** Built-in skills, authored in the same SKILL.md format users can import. */

export const BUILTIN_SKILLS: string[] = [
  `---
name: rubric-audit
description: Audit the draft line by line against every requirement in the supplied guidelines or rubric, then save a pass/fail compliance checklist. Use when the writer asks "does this meet the requirements", "check compliance", "will this pass review", or has uploaded a rubric, brief or submission guidelines.
version: 1.0.0
allowed-tools: [get_task, read_draft, read_source, search_sources, get_stats, add_note, finish]
---

# Rubric audit

Verify the draft satisfies every stated requirement. You never edit the draft in
this skill — you produce evidence.

## Procedure

1. Call \`get_task\` to see the assignment and the available sources.
2. Read every source whose role is \`guideline\`, \`template\` or \`reference\`
   with \`read_source\`. These define the requirements.
3. Extract an explicit requirement list. Include the implicit ones: word
   limits, required sections, formatting, tone, forbidden content, deadlines.
4. Call \`get_stats\` to check anything numeric (length limits especially).
5. Call \`read_draft\` and check each requirement one at a time. Use
   \`search_sources\` to re-check exact wording rather than trusting memory.
6. Call \`add_note\` with title "Compliance audit" and a Markdown table:

   | # | Requirement | Source | Status | Evidence |
   |---|-------------|--------|--------|----------|

   Status is PASS, FAIL, PARTIAL or UNCLEAR. Evidence quotes the draft (or
   states what is missing). Never mark PASS without a quotation.
7. Call \`finish\` summarising: total requirements, counts by status, and the
   failures ordered by how much they endanger acceptance.

## Rules

- A requirement you cannot verify is UNCLEAR, never PASS.
- Quote the rubric verbatim when stating what is required.
- If no rubric-like source exists, say so in \`finish\` and stop — do not invent criteria.
`,

  `---
name: line-edit-pass
description: Perform a careful line edit directly in the document, tightening prose sentence by sentence while preserving the writer's voice. Use when the writer asks to "line edit", "tighten", "polish", "copy edit", or "clean up the prose".
version: 1.0.0
allowed-tools: [get_task, read_draft, get_outline, get_stats, replace_in_draft, add_note, finish]
---

# Line edit pass

You edit the actual document. Work in small, verifiable steps.

## Procedure

1. \`get_task\` — learn the register and audience. A grant abstract and a blog
   post want opposite things.
2. \`get_stats\` — record the starting word count.
3. \`get_outline\` — if the draft has headings, edit section by section.
4. \`read_draft\` with \`with_line_numbers: true\`. Work through a bounded range
   at a time (roughly 40 lines) using \`start_line\`/\`end_line\`.
5. For each problem sentence, call \`replace_in_draft\`. Copy \`find\` EXACTLY
   from what you just read — including punctuation and capitalisation.
6. Keep a running list of the edits you make and why.
7. When the whole draft has been covered, call \`get_stats\` again.
8. \`add_note\` titled "Line edit log" — a bulleted changelog of every edit
   (original → edited — reason) plus a "Patterns to watch" section naming the
   writer's recurring habits.
9. \`finish\` — report words before/after and the three habits worth fixing.

## What to change

- Hedging and filler: "it is important to note that", "very", "really", "quite"
- Weak verb + noun where a strong verb exists: "make a decision" → "decide"
- Passive voice where the actor matters
- Repeated sentence openings and repeated words in close proximity
- Mixed metaphors, clichés, and tense or point-of-view slips

## What to protect

- The writer's voice, rhythm and idiom. You are tightening, not rewriting.
- Technical terms, quotations, names, numbers and citations — never alter these.
- Deliberate fragments used for effect.
- If a sentence is merely different from your taste, leave it alone.
`,

  `---
name: structural-diagnosis
description: Diagnose the draft's architecture — its argument, order, proportion and pacing — and propose a concrete restructuring plan without editing the text. Use when the writer says the piece "feels off", "doesn't flow", "is rambling", or asks about structure, organisation or order.
version: 1.0.0
allowed-tools: [get_task, read_draft, get_outline, get_stats, search_draft, add_note, finish]
---

# Structural diagnosis

Read-only. Produce a plan the writer can act on, not vague encouragement.

## Procedure

1. \`get_task\` — what is this piece supposed to accomplish, and for whom?
2. \`get_outline\` and \`get_stats\` — map the current shape and proportions.
3. \`read_draft\` in full.
4. Build a beat map: for each section, note its function (hook, context,
   claim, evidence, objection, turn, resolution) and its word share.
5. Diagnose against these failure modes:
   - **Buried lede** — the real thesis appears late
   - **Proportion** — trivial sections outweigh load-bearing ones
   - **Missing beat** — a claim with no evidence, or an unanswered objection
   - **Order** — a section depends on something introduced after it
   - **Flat arc** — no escalation; every paragraph at the same pitch
   - **Weak exit** — the ending summarises instead of landing
6. \`add_note\` titled "Structural diagnosis" containing the beat map table,
   the diagnosed problems with evidence, and a numbered restructuring plan
   with move/cut/expand instructions referencing headings or line numbers.
7. \`finish\` — the single highest-impact structural change, and why.

## Rules

- Never edit the draft in this skill.
- Every diagnosis cites a specific section, heading or line range.
- Prefer "move X before Y" and "cut ¶3, it repeats ¶1" over "improve flow".
`,
]
