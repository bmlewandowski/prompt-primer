# Prompt Primer

A hierarchical prompt compilation engine for assembling contextual AI system prompts
from a library of reusable fragments. Inspired by and compatible with
[Daniel Miessler's Fabric framework](https://github.com/danielmiessler/fabric).

---

## What it does

You select fragment files from an organizational hierarchy. The compiler merges them
into a single, clean system prompt — in Fabric-topology Markdown, XML, or plain prose
— ready to drop into any LLM interface or API call.

The web UI lets you browse the fragment library, select what applies to your context,
preview the compiled output in real time, track token budget, choose output format,
and manage the entire fragment library without touching the filesystem.

Your selection, token budget, and output format are automatically saved to
`localStorage` and restored on your next visit. A **Reset** button in the header
restores the factory-default fragment library (deletes all user-created fragments
and tiers, rewrites them from `defaults.json`) and clears saved session state.
A confirmation popup describes the full scope of the action before proceeding.

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

**3. Output formats match Fabric and modern LLM consumption patterns**

- `renderMarkdown()` — Fabric-topology Markdown for use with `fabric --pattern` or any LLM  
- `renderXml()` — XML-tagged sections (`<identity_and_purpose>`, `<context>`, etc.) for Anthropic / Claude  
- `renderProse()` — Plain text with no structural headers; sections joined with `---`  
- `renderJson()` — Structured JSON object `{ identity, context, steps, rules }` for programmatic use  
- `renderChatML()` — `<|im_start|>system\n...<|im_end|>` for open-weight models (Mistral, Qwen, llama.cpp, Ollama)  
- `renderOpenAIMessage()` — `{role: "system", content: ...}` for direct API calls, respects format  
- `renderWithFormat(blocks, format)` — Single dispatcher accepting `"fabric"` | `"xml"` | `"prose"` | `"json"` | `"chatml"`

**The core extension beyond Fabric**

Fabric is flat and CLI-first: one pattern equals one system prompt. Prompt Primer adds
the organizational layer Fabric leaves out — the answer to *"which patterns apply to me,
in my context, right now?"* The hierarchy encodes that answer structurally instead of
requiring manual pattern chaining.

---

## Telos — purpose-first prompt design

This project applies the **Telos framework** from
[Daniel Miessler's PAI architecture](https://danielmiessler.com/blog/personal-ai-infrastructure).
Telos (from Greek: *end goal, ultimate purpose*) is the principle that an AI system
should always operate in service of a clearly-stated purpose. Before choosing which
fragments to combine, you should be able to answer:

> *Who am I? What am I trying to accomplish? What does success look like?*

That answer belongs in the **`org` tier** — the highest-authority level in the hierarchy.
Every fragment below it should be understood as a refinement in service of that purpose,
not an independent configuration.

### Applying Telos to the fragment hierarchy

The six tiers map directly onto the Telos model:

| Tier | Telos role | What to put here |
|---|---|---|
| `org` | **Purpose layer** — your mission, ideal state, and foundational constraints | Mission statement, current challenges, principles that never change |
| `department` | **Domain layer** — the broad field of focus | Engineering craft standards, design principles, domain conventions |
| `team` | **Context layer** — who you're working with and how | Team-specific patterns, tooling conventions, collaboration norms |
| `project` | **Current-state layer** — what you're actively building | Project description, goals, architecture decisions, known constraints |
| `persona` | **Voice layer** — how the AI presents itself | Communication style, expertise depth, tone |
| `task` | **Action layer** — what you're doing right now | Specific instruction sets, Fabric patterns, task-scoped rules |

The flow from `org` → `task` mirrors the Telos outer loop: **current state → ideal state**.
The `org` fragment defines your ideal state; each lower tier narrows the context and method
for reaching it in the current situation.

### The `org` tier is not optional

A compiled prompt without an `org` fragment is context-free — the AI has no grounding in
purpose, no sense of what success means, and no constraints that transcend the immediate
task. The `org` tier should always be loaded.

An `org` fragment structured around Telos principles looks like this:

```yaml
id: global_default
tier: org
blocks:
  identity: |
    Your mission is to [purpose]. You exist to [ultimate goal], not merely to
    complete tasks. Every response should advance that mission.
  context: |
    Current state: [what is true right now — challenges, constraints, environment].
    Ideal state: [what success looks like — the destination you are hill-climbing toward].
  steps: |
    Operate in service of the mission above. When facing ambiguity, resolve it
    toward the ideal state. Raise concerns that would move away from it.
  rules:
    - key: hallucination
      content: "Never state something as fact you are not certain of."
    - key: scope
      content: "Decline work that conflicts with the stated mission."
```

### Multiple `org` fragments for different contexts

If you operate in meaningfully different contexts — professional work, personal projects,
creative writing — you can maintain multiple `org`-tier fragments and select the appropriate
one when building a prompt:

```
org/work.yaml      — professional mission and constraints
org/personal.yaml  — personal goals and ideal state
org/creative.yaml  — creative work purpose and voice
```

Only one `org` fragment should be active at a time. If two `org` fragments are selected,
their `identity` and `context` blocks will be concatenated — almost certainly not what you want.

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
  are **appended and deduplicated** — identical content is included only once.
- Persona fragments are **composable** — select multiple to stack traits (e.g.
  `persona_senior_engineer` + `persona_concise` + `persona_security_reviewer`).
- A fragment can declare `replace_blocks: [identity]` to **replace** (rather than
  append to) the accumulated content for those block keys from higher-priority tiers.
- The compiler **detects circular dependencies** within the selected fragment set and
  reports them in the manifest (compilation still proceeds).

---

## Repository structure

```
apps/
  web/                    Next.js 16 web UI — fragment browser + live preview
    app/
      api/compile/        POST — compile selected fragments (final export)
      api/preview/        POST — live preview (supports empty selection)
      api/fragments/      GET/POST — fragment registry CRUD
      api/fragments/[id]/ GET/PUT/DELETE — single fragment CRUD
      api/fragments/export/  GET  — download full library as JSON bundle
      api/fragments/import/  POST — import fragments from a JSON bundle
      api/fragments/reset/   POST — restore factory defaults from defaults.json
      api/tiers/          GET/POST — tier configuration CRUD
    components/
      LibraryManager.tsx  In-app fragment + tier editor (drag-and-drop reorder)
      FragmentEditor.tsx  Fragment form with all fields including replace_blocks
      PreviewPane.tsx     Compiled prompt viewer with warnings + manifest tab
      FragmentTree.tsx    Fragment browser / selection tree
      TokenBudget.tsx     Token budget usage bar
      ConfirmDialog.tsx   Reusable confirmation modal (delete actions + reset)
    lib/
      fragmentRegistry.ts Validated registry loader + path allowlist + write cache
      runCompile.ts       Shared compile handler used by both API routes
      auth.ts             Optional ADMIN_SECRET write-auth check
    proxy.ts              Sliding-window rate limiter (30 req/60s per IP)
packages/
  compiler/               Pure TypeScript compilation engine
    src/
      types.ts            Zod schemas and TypeScript types
      loader.ts           YAML fragment loader with validation
      merger.ts           Additive + keyed-override merge logic + cycle detection
      tokenizer.ts        js-tiktoken token counting
      renderer.ts         Fabric / XML / prose / JSON / ChatML renderers
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
    tiers.json            Ordered tier configuration (do not edit by hand)
    defaults.json         Factory-default snapshot (fragments + tiers) used by reset
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

**Write authentication** — mutating API routes (fragment/tier CRUD, import) check
for an `Authorization: Bearer <token>` header when `ADMIN_SECRET` is set. Requests
exceed 100 KB are rejected before parsing.

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
reports missing dependencies but still compiles. It also detects cycles within the
selected fragment set and surfaces them as warnings in the Preview pane.

The optional `replace_blocks` field lists block keys (`identity`, `context`, `steps`)
where this fragment's content should **replace** rather than append to content from
higher-priority tiers:

```yaml
replace_blocks: [identity]
```

Use this when a task or persona fragment should be the sole source of truth for a
particular block — e.g. a task that defines a completely different identity from org.

---

## Library Manager

Click **Manage Library** in the top-right of the web UI to open the in-app library
editor:

- **Tiers** — drag to reorder priority, rename, add, or delete
- **Fragments** — create, edit, and delete fragments; drag a fragment onto a tier to
  move it
- **Export** — downloads the entire fragment library as a JSON bundle
- **Import** — uploads a JSON bundle (exported from any Prompt Primer instance);
  existing fragments are skipped by default

All destructive operations (fragment delete, tier delete, and factory reset) require
confirmation through a modal dialog before proceeding. The **Reset** button in the
main header (outside the Library Manager) calls `POST /api/fragments/reset`, which
deletes all current YAML files, restores the originals from `defaults.json`, resets
`tiers.json`, and rebuilds the registry index.

Export format:
```json
{
  "version": "1",
  "exportedAt": "2026-05-30T…",
  "fragmentCount": 14,
  "fragments": [ … ]
}
```

The importer also accepts a raw JSON array of fragment objects.

---

## Output formats

Choose a format from the **Format** dropdown in the header. The selection applies to
both the live preview and the downloaded/copied output.

| Format | Description | Best for |
|--------|-------------|----------|
| `fabric` | Markdown H1 headers (`# IDENTITY AND PURPOSE`, etc.) | General LLM use, Fabric CLI |
| `xml` | XML-tagged sections (`<identity_and_purpose>`, etc.) | Anthropic / Claude |
| `prose` | Plain text, sections separated by `---` | Custom post-processing |
| `json` | Structured object `{ identity, context, steps, rules }` | Programmatic consumption, API wrappers |
| `chatml` | `<\|im_start\|>system\n...<\|im_end\|>` | Open-weight models: Mistral, Qwen, llama.cpp, Ollama |

The `outputFormat` field is recorded in the compilation manifest so consumers always
know which format was used.

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
