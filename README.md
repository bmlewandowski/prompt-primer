# Prompt Primer

A hierarchical prompt compilation engine for assembling contextual AI system prompts
from a library of reusable fragments. Inspired by and compatible with
[Daniel Miessler's Fabric framework](https://github.com/danielmiessler/fabric).

---

## What it does

You select fragment files from an organizational hierarchy. The compiler merges them
into a single, clean system prompt in Fabric-topology Markdown — or an OpenAI-ready
JSON message — ready to drop into any LLM interface or API call.

The web UI lets you browse the fragment library, select what applies to your context,
preview the compiled output, and track token budget in real time.

---

## Relationship to Fabric

Fabric structures system prompts using a named-section topology:

```
# IDENTITY and PURPOSE
# STEPS
# OUTPUT INSTRUCTIONS
```

This project uses that topology as its native output format. Every compiled prompt
is a valid Fabric-style system prompt. The relationship goes deeper in three ways:

**1. The fragment schema mirrors Fabric sections directly**

Each fragment YAML has `blocks` with fields that map one-to-one to Fabric sections:

| Fragment block | Fabric section              |
|----------------|-----------------------------|
| `identity`     | `# IDENTITY and PURPOSE`    |
| `context`      | *(augmented context block)* |
| `steps`        | `# STEPS`                   |
| `rules`        | `# OUTPUT INSTRUCTIONS`     |

**2. Fabric's community pattern library is importable**

The `sync-fabric` script fetches patterns from the official Fabric GitHub repository,
converts each `system.md` into a YAML fragment, and places it under `task/fabric/`.
The entire Fabric pattern catalog is available as task-level fragments.

```bash
pnpm sync-fabric                          # sync all patterns
pnpm sync-fabric --patterns=extract_wisdom,summarize  # specific patterns
pnpm sync-fabric --commit=<sha>           # pin to a specific commit
```

The script maintains a lock file (`task/fabric/.sync-lock.json`) with SHA-256 hashes
of every imported file. On subsequent syncs, on-disk content is verified against the
lock before skipping — tampered fragments are automatically re-fetched with a warning.

**3. Output formats match Fabric's two consumption targets**

- `renderMarkdown()` — Fabric-topology Markdown for use with `fabric --pattern` or any LLM
- `renderOpenAIMessage()` — `{role: "system", content: ...}` for direct API calls

**The core extension beyond Fabric**

Fabric is flat and CLI-first: one pattern equals one system prompt. Prompt Primer adds
the organizational layer Fabric leaves out — the answer to *"which patterns apply to me,
in my context, right now?"* The hierarchy encodes that answer structurally instead of
requiring manual pattern chaining.

---

## Fragment hierarchy

Fragments are organized in six tiers. When compiled, lower tiers extend and override
higher ones.

```
org/          Universal constraints — applies to every prompt
department/   Practice-area conventions (Engineering, Design, Product)
team/         Team-specific patterns (Backend, Frontend, Platform, Data, QA, Security)
project/      Project context and dependencies
persona/      Cross-cutting behavioral traits — expertise depth, communication style
task/         What you are doing right now (also where Fabric patterns land)
```

Merge behavior:
- `identity`, `context`, and `steps` blocks are **concatenated** org → task so every
  layer's voice is present in the final prompt.
- `rules` with a `key` are **overridden** by lower tiers (task beats org). Unnamed rules
  are always appended.
- Persona fragments are **composable** — select multiple to stack traits (e.g.
  `persona_senior_engineer` + `persona_concise` + `persona_security_reviewer`).

---

## Repository structure

```
apps/
  web/                    Next.js 16 web UI — fragment browser + live preview
    app/
      api/compile/        POST — compile selected fragments (final export)
      api/preview/        POST — live preview (supports empty selection)
      api/fragments/      GET  — fragment registry for the browser
    components/           React UI components
    lib/
      fragmentRegistry.ts Validated registry loader + path allowlist
      runCompile.ts       Shared compile handler used by both API routes
    proxy.ts              Sliding-window rate limiter (30 req/60s per IP)
packages/
  compiler/               Pure TypeScript compilation engine
    src/
      types.ts            Zod schemas and TypeScript types
      loader.ts           YAML fragment loader with validation
      merger.ts           Additive + keyed-override merge logic
      tokenizer.ts        js-tiktoken token counting
      renderer.ts         Fabric Markdown + OpenAI JSON renderers
  fragments/              YAML fragment library
    org/                  Organization-level fragments
    department/           Department-level fragments
    team/                 Team-level fragments
    project/              Project-level fragments
    persona/              Persona fragments — expertise, style, communication traits
    task/
      custom/             Hand-authored task fragments
      fabric/             Auto-synced from Fabric pattern library
    scripts/
      generate-registry.ts  Registry index builder
      validate.ts           Fragment schema validator
    .registry.json        Auto-generated index (do not edit by hand)
scripts/
  sync-fabric.ts          Fabric pattern import script (with SHA-256 lock)
```

---

## Getting started

**Prerequisites:** Node.js ≥ 25, pnpm ≥ 10

```bash
pnpm install
pnpm --filter @prompt-primer/compiler build
pnpm generate-registry
pnpm dev                  # starts web UI at localhost:3000
```

---

## Working with fragments

**Validate all fragments:**
```bash
pnpm validate-fragments
```

**Regenerate the registry** (required after adding or renaming fragment files):
```bash
pnpm generate-registry
```

**Run compiler tests:**
```bash
pnpm test
```

**Type-check the web app:**
```bash
cd apps/web && pnpm exec tsc --noEmit
```

---

## Security

**Path traversal** — The compiler rejects any fragment path that resolves outside
`fragmentsBaseDir` (catches both `../../traversal` and absolute paths). API routes
cross-check every requested path against the registry allowlist before touching the
filesystem.

**Registry integrity** — `loadValidatedRegistry()` re-validates every entry in
`.registry.json` against the full Zod schema before trusting any path. A tampered
or manually edited registry entry will be rejected at request time.

**Rate limiting** — `/api/compile` and `/api/preview` are protected by an in-memory
sliding-window limiter (30 requests / 60 seconds per IP). For multi-instance
deployments replace with a Redis-backed strategy.

**Fabric sync integrity** — `sync-fabric` validates pattern names against
`/^[a-z0-9_-]+$/` before any URL interpolation and stores a SHA-256 hash of each
imported file. On subsequent runs, on-disk content is verified against the lock.

---

## Writing a fragment

Fragments are YAML files. Drop them in the appropriate tier directory.
The `id` must be unique across the entire library.

```yaml
id: team_my_team
tier: team
meta:
  version: "1.0.0"
  description: "My team — brief description"
  tags: [my-team]
  author: my-team
  updated: "2026-05-28"
  fabric_source: null
depends_on: [global_default]
blocks:
  identity: |
    You are an expert in ...
  context: null
  steps: null
  rules:
    - content: "Always ..."
    - key: "output_format"
      content: "Format output as ..."
```

The `depends_on` field declares which other fragments this one requires. The compiler
will report missing dependencies but still compile — it will not silently drop them.

---

## Fragment authorship — WealthCounsel

The current fragment library is authored for WealthCounsel engineering. Key fragments:

| Fragment | Tier | Description |
|---|---|---|
| `global_default` | org | Universal constraints, zero hallucination, security rules |
| `dept_engineering` | department | Engineering software craft standards, architecture principles, and code review culture |
| `dept_design` | department | UX principles, design systems, and accessibility standards |
| `dept_product` | department | User outcomes, requirements clarity, and delivery discipline |
| `team_backend` | team | API design, services, databases, and performance |
| `team_frontend` | team | UI/UX, accessibility, and component architecture |
| `team_platform` | team | Infrastructure, CI/CD, observability, and reliability |
| `team_data` | team | Pipelines, analytics, schema design, and data quality |
| `team_qa` | team | Quality assurance, test strategy, and release validation |
| `team_security` | team | AppSec, threat modeling, and secure code review |
| `project_irons_in_fire` | project | Irons in Fire — goal tracking and org hierarchy visualization tool |
| `task_code_review` | task | Perform a thorough code review of a given diff or file |
| `task_spec_draft` | task | Draft a functional specification document from a feature description |

### Persona fragments

| Fragment | Description |
|---|---|
| `persona_senior_engineer` | Experienced, pragmatic, strong opinions, skips basics |
| `persona_concise` | Terse and direct — no filler, no summaries, no affirmations |
| `persona_security_reviewer` | Adversarial mindset, OWASP-aware, risk-rated findings |
| `persona_mentor` | Patient, teaching-oriented, explains reasoning, calibrates to audience |

Persona fragments are composable. Selecting multiple stacks their `identity` and `rules`
contributions — e.g. `persona_senior_engineer` + `persona_concise` produces a senior
engineer who is also terse.
