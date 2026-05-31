
# Prompt Primer

A hierarchical prompt compilation engine for assembling contextual AI system prompts
from a library of reusable fragments. Inspired by and compatible with
[Daniel Miessler's Fabric framework](https://github.com/danielmiessler/fabric).

---

## Getting started

**Prerequisites:** Node.js ≥ 25, pnpm ≥ 10

```bash
pnpm install
pnpm build                # builds all packages including compiler
pnpm generate-registry    # creates .registry.json (requires built compiler)
pnpm dev                  # starts web UI at localhost:3000
```

On first launch, the app starts with an empty fragment library and prompts you to select a starter pack. You can also dismiss the prompt and build your library from scratch using the Library Manager.

You can access starter packs at any time via the **Clear Library** button in the header, which deletes all fragments and shows the starter pack selector.

| Starter Pack | Best For | Includes |
|--------------|----------|----------|
| **Software Development Team** | Engineering teams | Backend, frontend, platform, QA, security fragments + code review tasks |
| **Product & Design Team** | Product managers & designers | Design, product management, UX, requirements fragments |
| **Data & Analytics Team** | Data engineers & analysts | Data pipelines, analytics, schema design, quality fragments |
| **Full Organization** | Complete setup | All departments, teams, personas, and tasks |
| **Minimal Starter** | Clean slate | Only org defaults and basic personas |

When you apply a starter pack:
1. The fragments are imported into your library (if not already present)
2. The UI automatically selects those fragments
3. A live preview is triggered
4. You can then customize by adding/removing fragments or editing them

---

## What it does

You select fragment files from an organizational hierarchy. The compiler merges them
into a single, clean system prompt — in Fabric-topology Markdown, XML, or plain prose
— ready to drop into any LLM interface or API call.

The web UI lets you browse the fragment library, select what applies to your context,
preview the compiled output in real time, track token budget, choose output format,
and manage the entire fragment library without touching the filesystem. **One-click
export** to ChatGPT, Claude Projects, GitHub Copilot, and VS Code formats eliminates
copy/paste friction.

Your selection, token budget, and output format are automatically saved to
`localStorage` and restored on your next visit. A **Clear Library** button in the header
deletes all fragments and clears your library, then prompts you to select a starter pack
or build from scratch. A confirmation popup describes the full scope of the action before
proceeding.

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
    defaults.json         Template library used by starter packs
    presets/              Starter pack JSON files for quick library setup
scripts/
  sync-fabric.ts          Fabric pattern import script (with SHA-256 lock)
```

---

## Getting started

**Prerequisites:** Node.js ≥ 25, pnpm ≥ 10

```bash
pnpm install
pnpm build                # builds all packages including compiler
pnpm generate-registry    # creates .registry.json (requires built compiler)
pnpm dev                  # starts web UI at localhost:3000
```

### Starter Packs

**On first launch**, the app starts with an empty fragment library and prompts you to select
a starter pack. You can also dismiss the prompt and build your library from scratch using the
Library Manager.

You can access starter packs at any time via the **Clear Library** button in the header, which
deletes all fragments and shows the starter pack selector.

| Starter Pack | Best For | Includes |
|--------------|----------|----------|
| **Software Development Team** | Engineering teams | Backend, frontend, platform, QA, security fragments + code review tasks |
| **Product & Design Team** | Product managers & designers | Design, product management, UX, requirements fragments |
| **Data & Analytics Team** | Data engineers & analysts | Data pipelines, analytics, schema design, quality fragments |
| **Full Organization** | Complete setup | All departments, teams, personas, and tasks |
| **Minimal Starter** | Clean slate | Only org defaults and basic personas |

When you apply a starter pack:
1. The fragments are imported into your library (if not already present)
2. The UI automatically selects those fragments
3. A live preview is triggered
4. You can then customize by adding/removing fragments or editing them

The **Clear Library** button in the header deletes all fragments and shows the starter pack
selector again, allowing you to start fresh.

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

## Testing

The project has comprehensive unit and integration test coverage with 327 tests across the compiler package and web app.

### Test Suite Structure

**Compiler Package** (173 tests, ~85% coverage):

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `tokenizer.test.ts` | 19 | Token counting, encoding support, encoder caching |
| `renderer.test.ts` | 44 | All output formats (Fabric, XML, prose, JSON, ChatML), header escaping |
| `linter.test.ts` | 27 | Identity clarity, rule quality, consistency checks |
| `merger.test.ts` | 33 | Block merging, replace_blocks, circular dependencies, rule deduplication |
| `loader.test.ts` | 23 | YAML loading, validation, schema enforcement, error handling |
| `index.test.ts` | 27 | End-to-end integration, security (path traversal), all formats |

**Web App** (154 tests):

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `auth.test.ts` | 18 | Bearer token auth, request body size limits, security middleware |
| `runCompile.test.ts` | 14 | Compilation integration, registry allowlist, lint warnings, error responses |
| `platformExports.test.ts` | 43 | Platform-specific formatting (ChatGPT, Claude, Copilot, cURL, VS Code), character limits |
| `fragmentHistory.test.ts` | 22 | Revision tracking, timestamp-based retrieval, JSONL persistence, cleanup |
| `fragmentRegistry.test.ts` | 57 | CRUD operations, concurrency control, caching, registry regeneration, path security |

### Running Tests

```bash
# Run all tests (from project root)
pnpm test

# Run compiler tests only
cd packages/compiler && pnpm test

# Run web app tests only
cd apps/web && pnpm test

# Run tests in watch mode (auto-rerun on changes)
cd packages/compiler && pnpm test:watch
cd apps/web && pnpm test:watch

# Run a specific test file
cd packages/compiler && pnpm exec vitest run tests/tokenizer.test.ts
cd apps/web && pnpm exec vitest run tests/platformExports.test.ts
```

### What's Tested

**Core Functionality:**
- ✅ Fragment loading from YAML with full schema validation
- ✅ Block merging with tier priority (org → department → team → project → persona → task)
- ✅ Keyed rule override behavior (lower tiers win)
- ✅ Unnamed rule deduplication
- ✅ `replace_blocks` directive for identity/context/steps replacement
- ✅ Circular dependency detection in `depends_on` graphs
- ✅ Missing dependency reporting
- ✅ Token counting with cl100k_base and o200k_base encodings
- ✅ All output formats: Fabric, XML, prose, JSON, ChatML
- ✅ Quality linting (vague identities, long rules, contradictions)

**Web App Core:**
- ✅ Fragment CRUD operations (create, read, update, delete)
- ✅ Registry management and regeneration
- ✅ Write lock concurrency control prevents data corruption
- ✅ In-process registry caching and invalidation
- ✅ Tier configuration loading and persistence
- ✅ Fragment revision history (append, load, delete)
- ✅ Timestamp-based revision retrieval
- ✅ JSONL persistence for version tracking
- ✅ Platform-specific export formatting (ChatGPT, Claude, Copilot, cURL, VS Code)
- ✅ Character limit warnings (ChatGPT 1500 char custom instructions)
- ✅ Metadata inclusion/exclusion in exports
- ✅ Special character handling in formatted outputs
- ✅ Compilation integration with registry allowlist
- ✅ Lint warnings integration in compile responses

**Security:**
- ✅ Path traversal prevention (`../` sequences rejected)
- ✅ Absolute path rejection outside base directory
- ✅ Post-normalization path validation
- ✅ Bearer token authentication middleware
- ✅ Request body size limits (100 KB)
- ✅ Safe fragment/tier ID validation (alphanumeric + hyphens/underscores only)

**Error Handling:**
- ✅ Missing file detection
- ✅ YAML parse error reporting
- ✅ Schema validation with detailed error messages
- ✅ Invalid semver, URLs, and field formats

### Adding New Tests

Tests use Vitest with a simple pattern:

```typescript
import { describe, it, expect } from "vitest";

describe("feature name", () => {
  it("does something specific", () => {
    // Arrange: set up test data
    // Act: call the function
    // Assert: verify the result
    expect(result).toBe(expected);
  });
});
```

For tests requiring file I/O, use temporary directories:

```typescript
import { beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const testDir = join(tmpdir(), `test-${Date.now()}`);

beforeAll(async () => {
  await mkdir(testDir, { recursive: true });
  // Create test fixtures
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});
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

All destructive operations (fragment delete, tier delete, and library clear) require
confirmation through a modal dialog before proceeding. The **Clear Library** button in the
main header (outside the Library Manager) calls `POST /api/fragments/reset`, which
deletes all current YAML files, resets `tiers.json` to default structure, and rebuilds
the registry index. After clearing, the starter pack selector is shown.

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

## Platform Export

The **Export to Platform** button in the Preview pane provides one-click export to popular
AI platforms with platform-specific formatting and constraints.

### Available exports

| Platform | Action | Description |
|----------|--------|-------------|
| **ChatGPT Custom Instructions** | Copy to clipboard | Formats for ChatGPT's custom instructions. Warns if content exceeds 1500 character limit. |
| **Claude Projects** | Copy to clipboard | Exports as Markdown with metadata header for Claude Projects knowledge base. |
| **GitHub Copilot** | Copy to clipboard | Formats as `.github/copilot-instructions.md` for repository-level context. |
| **VS Code Instructions** | Copy to clipboard | Formats as `.instructions.md` for workspace root (used by GitHub Copilot in VS Code). |
| **cURL API Example** | Download file | Generates ready-to-run shell script with OpenAI and Anthropic API examples. |

### Usage

1. Compile your prompt by selecting fragments
2. Click **Export to Platform** in the Preview pane
3. Choose your target platform from the dropdown
4. The formatted content is copied to clipboard (or downloaded for cURL)
5. A success toast confirms the action

### Platform-specific notes

**ChatGPT Custom Instructions** — ChatGPT limits custom instructions to 1500 characters.
If your compiled prompt exceeds this limit, you'll see a warning with the actual character
count. Consider:
- Selecting fewer fragments
- Using more concise personas
- Splitting context across "What would you like ChatGPT to know" and "How would you like
  ChatGPT to respond" fields manually

**GitHub Copilot** — The exported `.github/copilot-instructions.md` file should be placed
in your repository root. Commit it to version control so all team members share the same
context. GitHub Copilot will automatically load these instructions when working in the repo.

**VS Code Instructions** — Place the exported `.instructions.md` file in your workspace
root (the folder opened in VS Code). GitHub Copilot in VS Code will read this file and
apply the context to all conversations in that workspace.

**cURL Examples** — The downloaded shell script includes:
- OpenAI API example (GPT-4)
- Anthropic API example (Claude 3.5 Sonnet) commented out
- Replace `YOUR_API_KEY` with your actual API key before running
- Adjust model, temperature, and max_tokens as needed

---

## Fragment Quality Linter

The **Quality** tab in the Preview pane analyzes your selected fragments and provides
warnings and suggestions to help you write clearer, more effective prompts.

### What it checks

The linter performs four categories of analysis:

**1. Identity Clarity**
- Flags identities with too many vague words ("help", "assist", "support", etc.)
- Warns if identity blocks are too short (<10 words)
- Checks for proper Telos framing (includes "current state" and "ideal state" labels)

**2. Rule Length**
- Flags individual rules exceeding 200 words (suggests splitting into multiple rules)
- Warns when a fragment has more than 5 rules (suggests splitting into separate fragments)

**3. Rule Consistency**
- Detects contradictory directives across selected fragments:
  - "always" vs. "never"
  - "must" vs. "optional"
  - "formal" vs. "casual"
  - "verbose" vs. "concise"
  - And other common conflicts
- Identifies keyed rule overrides (lower-tier fragments replacing higher-tier rules)

**4. Structure**
- Highlights fragments with missing or empty required blocks
- Warns about potential merge conflicts

### Using the Quality tab

1. Select fragments and compile your prompt
2. Click the **Quality** tab in the Preview pane
3. Review warnings organized by severity:
   - **Error** (red) — Critical issues that should be fixed
   - **Warning** (amber) — Potential problems worth reviewing
   - **Info** (blue) — Suggestions for improvement

Each warning shows:
- The fragment ID where the issue was found
- The category of the issue
- A clear description of the problem
- A suggestion for how to fix it

### Empty state

When no quality issues are found, you'll see a success message:
> **No Quality Issues Found**  
> Your selected fragments follow best practices for identity clarity, rule length, and consistency.

### Why quality matters

Prompt quality directly impacts AI performance:
- **Vague identities** lead to generic, unfocused responses
- **Overly long rules** cause attention dilution and inconsistent application
- **Contradictory rules** confuse the model and produce unpredictable behavior
- **Too many rules per fragment** makes maintenance and reuse difficult

The linter helps you catch these issues before they affect your results.

---

## Fragment Version History & Diff View

Every time you save changes to a fragment, the previous version is automatically archived
to a revision history log. You can view, compare, and restore any previous version through
the **View History** button in the Fragment Editor.

### How it works

**Automatic versioning:**
- Every PUT request to `/api/fragments/[id]` saves the current version before applying changes
- Revisions are stored as JSON Lines (`.jsonl`) in `packages/fragments/.registry-history/`
- One history file per fragment: `[fragment_id].jsonl`
- Each line contains a complete snapshot: timestamp, full fragment data, optional note

**Viewing history:**
1. Open any fragment in the Fragment Editor
2. Click **View History** in the header (clock icon next to fragment name)
3. Browse all previous versions in the sidebar, newest first
4. Select a version to view it

**Comparing versions:**
- **Diff View** (default): Side-by-side comparison of selected version vs. current
- **Full View**: See the complete YAML content of the selected version
- Toggle between modes with the "Show diff view" checkbox
- Diff highlighting:
  - <span style="color: #bbf7d0; background: #052e16;">Green</span>: Added content
  - <span style="color: #fca5a5; background: #450a0a;">Red</span>: Removed content
  - Dark theme optimized for long viewing sessions

**Restoring versions:**
1. Select a historical version from the sidebar
2. Click the **RESTORE** button next to the version
3. Confirm the restoration
4. The fragment editor loads the historical version
5. Click **Save Fragment** to make it the current version

### API endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/fragments/[id]/history` | GET | Returns all revisions for a fragment |
| `/api/fragments/[id]/history/[timestamp]` | GET | Returns a specific revision |
| `/api/fragments/[id]/history/[timestamp]/restore` | POST | Restores a revision as the current version |

### Storage & retention

- **Format**: JSON Lines (`.jsonl`) — one JSON object per line, append-only
- **Location**: `packages/fragments/.registry-history/[fragment_id].jsonl`
- **Cleanup**: History files are deleted when fragments are deleted
- **Retention**: Currently unlimited — consider implementing a retention policy for production use

### Technical notes

**Dependencies:**
- `react-diff-viewer-continued` — actively maintained fork for diff rendering
- Uses `js-tiktoken` from compiler for token-aware viewing

**Concurrent access:**
- Revision writes are protected by the same write lock as fragment updates
- Append-only format ensures no data loss from concurrent writes

**Future enhancements:**
- Configurable retention policy (e.g., keep last 50 versions or 90 days)
- Compressed storage for older revisions
- Diff statistics (lines added/removed, token delta)
- Blame view showing who made which changes

---

## Example Fragments

The included fragment library provides generic examples across all tiers. These serve as
templates that you can customize for your organization, team, or projects.

### Organization & Department Fragments

| Fragment | Tier | Description |
|---|---|---|
| `global_default` | org | Baseline values: ownership, action bias, clear communication, no surprises |
| `dept_engineering` | department | Software craft standards: SOLID, DRY, separation of concerns |
| `dept_design` | department | UX principles, design systems, accessibility (WCAG 2.1 AA), user-centered design |
| `dept_product` | department | Product strategy, user research, prioritization, metrics-driven decisions |

### Team Fragments

| Fragment | Description |
|---|---|
| `team_backend` | API design, services, databases, and performance optimization |
| `team_frontend` | UI implementation, component architecture, accessibility (WCAG), responsive design |
| `team_platform` | Infrastructure, CI/CD, observability, and site reliability |
| `team_data` | Pipelines, analytics, schema design, and data quality |
| `team_qa` | Quality assurance, test strategy, and release validation |
| `team_security` | AppSec, threat modeling, and secure code review |

### Project & Task Fragments

| Fragment | Tier | Description |
|---|---|
| `project_ecommerce_platform` | project | E-commerce storefront with cart, checkout, and orders |
| `task_code_review` | task | Perform a thorough code review of a given diff or file |
| `task_design_review` | task | Perform a design critique evaluating UX, accessibility, and visual consistency |
| `task_accessibility_audit` | task | Comprehensive WCAG 2.1 AA accessibility compliance audit |
| `task_user_research_plan` | task | Design a user research study with method selection and participant criteria |
| `task_spec_draft` | task | Draft a functional specification from a feature description |

### Persona Fragments

| Fragment | Description |
|---|---|
| `persona_senior_engineer` | Experienced, pragmatic, strong opinions, skips basics |
| `persona_concise` | Terse and direct — no filler, no summaries, no affirmations |
| `persona_security_reviewer` | Adversarial mindset, OWASP-aware, risk-rated findings |
| `persona_mentor` | Patient, teaching-oriented, explains reasoning, calibrates to audience |
| `persona_ux_researcher` | User research specialist, qualitative/quantitative methods, evidence-based design |

Persona fragments are composable. Selecting multiple stacks their `identity` and `rules`
contributions — e.g. `persona_senior_engineer` + `persona_concise` produces a senior
engineer who is also terse.

### Customizing for Your Organization

1. **Replace `global_default`** with your organization's mission, values, and constraints.
2. **Add department fragments** for your org structure (Sales, Marketing, Legal, etc.).
3. **Create team fragments** for your specific teams and their conventions.
4. **Document active projects** as project-tier fragments with technical context.
5. **Define task fragments** for repeated workflows (incident response, onboarding, etc.).

All fragments are fully editable through the Library Manager UI or by editing YAML files
directly in `packages/fragments/`.
