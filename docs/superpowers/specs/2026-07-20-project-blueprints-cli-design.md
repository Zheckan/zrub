# Project Blueprints CLI Design

**Date:** 2026-07-20

## Purpose

`project-blueprints` is a repository and npm CLI for distributing reusable
project resources that developers and AI coding agents can install into new or
existing projects.

Despite the package name, the catalog is not limited to architecture
blueprints. It can contain engineering guides, prompts, editable templates,
examples, and code. The general term for an installable catalog entry is
**resource**.

The published npm package is launcher-agnostic. It can be invoked from the
target project's root directory with any of these equivalent commands:

```sh
npx project-blueprints@latest
pnpm dlx project-blueprints@latest
yarn dlx project-blueprints@latest
bunx project-blueprints@latest
```

`yarn dlx` means a modern Yarn release that provides the `dlx` command; Yarn
Classic 1.x is not supported by that invocation. `bunx` respects the package's
`#!/usr/bin/env node` shebang by default, so Node.js `>=22` remains a runtime
requirement when launching through Bun.

It presents an interactive resource selection, previews every filesystem
operation, asks for one confirmation, and then installs the approved resources
according to their declared destinations.

## MVP Scope

The MVP includes:

- One interactive default command with no subcommands.
- A bundled, metadata-driven resource catalog.
- Checkbox selection of one or more resources.
- Destination planning relative to the current working directory.
- One complete installation review and one confirmation before any writes.
- Safe creation, full-file replacement conflicts, and one-time managed prepend
  behavior for editable shared files such as `AGENTS.md`.
- Two initial resources:
  - `frontend-project-structure`
  - `agents-project-guide`
- Automated tests, npm package-content verification, and a local packed-package
  smoke test.

The MVP does not include:

- `list`, `add`, `update`, `remove`, or inspection subcommands.
- A project installation manifest.
- Automatic updating or merging of an editable managed block.
- A server, remotely updated catalog, web interface, or submissions API.
- Invented prompt, example, or code resources whose only purpose is to
  demonstrate catalog kinds.

## Terminology and Repository Layout

Publishable resources live in `resources/`. Documentation about developing
this repository lives in `docs/`.

```text
project-blueprints/
  AGENTS.md
  README.md
  LICENSE
  package.json
  pnpm-lock.yaml
  tsconfig.json
  vitest.config.ts

  src/
    cli/
    catalog/
    installer/

  resources/
    frontend-project-structure/
      resource.json
      frontend-project-structure.md
    agents-project-guide/
      resource.json
      AGENTS.md

  tests/
    fixtures/
    catalog/
    installer/
    cli/

  docs/
    superpowers/
      specs/
      plans/

  .github/
    workflows/
      ci.yml
```

The initial resource kinds are `guide`, `prompt`, `template`, `example`, and
`code`. A kind labels and organizes a resource; it does not determine how its
files are installed.

## Resource Format

Each resource is a self-contained directory with one `resource.json` metadata
file and one or more payload files.

The initial metadata shape is:

```ts
type ResourceKind = "guide" | "prompt" | "template" | "example" | "code";

type ExistingFilePolicy = "managed-prepend-once";

interface ResourceFile {
  source: string;
  destination: string;
  onExisting?: ExistingFilePolicy;
}

interface ResourceDefinition {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  kind: ResourceKind;
  files: ResourceFile[];
}
```

Example:

```json
{
  "schemaVersion": 1,
  "id": "agents-project-guide",
  "name": "Agent project guide",
  "description": "Adds an editable project overview and shared findings template.",
  "kind": "template",
  "files": [
    {
      "source": "AGENTS.md",
      "destination": "./",
      "onExisting": "managed-prepend-once"
    }
  ]
}
```

Catalog validation must reject unsupported schema versions, duplicate resource
IDs, unknown kinds or existing-file policies, missing required fields, empty
file lists, missing payload files, source paths that escape the resource
directory, and unsafe destinations. `managed-prepend-once` is valid only when
the resolved source and destination are Markdown files, because its ownership
markers use Markdown comments.

## Destination Resolution

All destinations are relative to the target project passed to the planner. The
CLI uses `process.cwd()` as that target.

- A destination ending in `/` is a directory destination. The source basename
  is preserved. For example, `"./"` plus `AGENTS.md` resolves to root
  `AGENTS.md`.
- Any other destination is an exact target filename. For example,
  `docs/architecture/frontend.md` is used literally.
- Missing parent directories are part of the installation plan and are created
  only after confirmation.
- Absolute paths and destinations that escape the target through `..` are
  invalid.
- Existing symbolic links in the destination or any existing ancestor segment
  are rejected so a resource cannot write outside the target project.

## Existing-File Behavior

File existence determines whether an operation is a creation. `create` is not
stored as a metadata mode.

### Destination does not exist

The planner returns `CREATE` with the complete destination path.

### Destination has identical content

For a resource without an existing-file policy, the planner returns
`UNCHANGED` and performs no write.

### Destination exists without `onExisting`

Different content is a full-file replacement conflict. The review labels it
`REPLACE - CONFLICT` and makes the destructive effect prominent. The executor
may replace it only if that exact replacement appeared in the reviewed plan and
the user approved the whole plan.

### `managed-prepend-once`

This policy is intended for editable shared Markdown files such as `AGENTS.md`.

- If the destination is missing, create it with the resource-owned markers and
  payload.
- If the destination exists without the resource's markers, plan a prepend at
  the top of the file.
- If one complete resource-owned block already exists, return
  `ALREADY INSTALLED` and preserve the entire block byte-for-byte, including
  user and agent edits.
- If only one marker exists, markers are reversed, or multiple blocks for the
  same resource exist, return a conflict and do not guess how to edit the file.

The installer generates markers; they are not stored in the payload:

```md
<!-- project-blueprints:agents-project-guide:start -->
...editable installed content...
<!-- project-blueprints:agents-project-guide:end -->
```

This block is deliberately not auto-updated. The project overview and Findings
are editable project knowledge, and rerunning the installer must not erase
them.

## Architecture

The implementation has four focused modules.

### Catalog module

The catalog module discovers bundled resource directories, parses and validates
their metadata, and returns resource definitions with resolved payload paths.
Callers do not need to know how resources are laid out inside the npm package.

### Planner module

The planner is the central deep module. Given selected resource definitions and
a target root, it returns a complete, ordered installation plan without writing
anything.

Its interface hides:

- Destination resolution.
- Path containment and symbolic-link checks.
- Existing-content comparison.
- Marker generation and validation.
- Operation classification.
- The final content required by each write operation.

The planner returns explicit operations classified as `CREATE`, `PREPEND`,
`REPLACE_CONFLICT`, `UNCHANGED`, `ALREADY_INSTALLED`, or
`MALFORMED_MARKERS_CONFLICT`.

### Executor module

The executor accepts only a reviewed and approved installation plan. It creates
required directories and writes each changed file through a temporary sibling
followed by an atomic rename.

If an operation fails, execution stops. The result reports the failed operation
and exactly which earlier operations succeeded. The MVP does not claim
multi-file transactional rollback.

### CLI module

The CLI coordinates catalog loading, prompts, planning, review presentation,
confirmation, execution, and the final summary. Terminal prompts sit behind a
small prompt interface so tests can use a deterministic adapter instead of an
interactive terminal.

The dependency flow is:

```text
bundled resources
  -> catalog loader
  -> checkbox selection
  -> installation planner
  -> grouped review
  -> one confirmation
  -> executor
  -> result summary
```

## Interactive Flow

1. Resolve the target root from `process.cwd()`.
2. Load and validate the bundled catalog.
3. Present all resources with name, kind, and description in a checkbox menu.
4. Exit successfully without writes if nothing is selected.
5. Build the complete installation plan.
6. Display every result grouped as:
   - `CREATE`
   - `PREPEND`
   - `REPLACE - CONFLICT`
   - `UNCHANGED`
   - `ALREADY INSTALLED`
   - malformed-marker conflicts
7. If a malformed-marker conflict exists, stop after the review without
   offering execution. The user must repair the ambiguous file and rerun.
8. Show an additional warning when the plan contains full replacements.
9. Ask once whether to apply the entire displayed plan.
10. Exit successfully without writes if the user declines.
11. Apply the plan and print exact successes or the precise partial-failure
    state.
12. Remind the user to replace placeholders in newly installed editable
    templates.

Cancellation through Ctrl-C exits cleanly without a stack trace and without
writes when cancellation happens before execution.

## Initial Resources

### Frontend project structure

- ID: `frontend-project-structure`
- Kind: `guide`
- Source: `frontend-project-structure.md`
- Destination: `docs/project-guides/frontend-project-structure.md`
- Existing-file policy: none

The payload is the supplied React structure guide. It describes thin pages,
product logic in `features`, reusable business logic in `domain`, reusable UI in
`ui`, configuration in `config`, a container/view split, colocated supporting
files, and `@/` absolute imports.

### Agent project guide

- ID: `agents-project-guide`
- Kind: `template`
- Source: `AGENTS.md`
- Destination: `./`, resolving to root `AGENTS.md`
- Existing-file policy: `managed-prepend-once`

The template contains explicit editable placeholders for:

- The project's purpose and high-level shape.
- Important paths and local conventions.
- Development and verification commands.

It also contains a `Findings` section. Its instructions tell agents to record
concise, verified, non-obvious knowledge that is useful across tasks, especially
surprises, recurring confusion, and broadly relevant pitfalls. Findings are not
an activity log, must not contain secrets, and should be corrected or removed
when stale.

## This Repository's `AGENTS.md`

The root `AGENTS.md` in the `project-blueprints` repository is real project
documentation, not the installable template. It contains:

- An accurate overview of this repository.
- The distinction between publishable `resources/` and development `docs/`.
- The location of CLI, catalog, installer, and test code.
- Required verification commands.
- A Findings section governed by the same concise, verified, project-wide
  knowledge rules.

## Tooling and Distribution

- Package and repository name: `project-blueprints`.
- Runtime: Node.js `>=22`.
- Language and module format: TypeScript with native ESM.
- Development package manager: pnpm 11.15.1, pinned through the `packageManager`
  field and `pnpm-lock.yaml`. Contributors use pnpm for dependency and script
  workflows.
- Publication registry: npm.
- Interactive prompts: `@clack/prompts`.
- Compilation: `tsc`; the MVP does not need a bundler.
- Tests: Vitest.
- Formatting: Prettier with a CI-enforced format check. ESLint is not required
  for the MVP; TypeScript strict checking covers type-level correctness.
- License: MIT.
- npm package contents: compiled runtime, bundled `resources/`, README, license,
  and package metadata. Development sources, tests, fixtures, and internal docs
  are not published unless required for license or package operation.
- The executable entry uses the `package.json` `bin` field and includes a Node
  shebang so npm, pnpm, modern Yarn, and Bun package launchers all start the
  same Node.js CLI.

As verified on 2026-07-20, Node 22 and Node 24 are supported LTS releases,
`@clack/prompts` 1.7.0 supports Node `>=20.12.0`, pnpm 11.15.1 requires Node
`>=22.13`, and the npm registry returned `E404` for `project-blueprints`.
Package-name availability is not reserved and must be checked again immediately
before publication.

## Testing and Release Verification

Automated coverage includes:

- Valid and invalid catalog metadata.
- Duplicate IDs and missing payload files.
- Directory and exact-file destination resolution.
- Absolute-path, traversal, and symbolic-link rejection.
- Every planner operation and conflict classification.
- Exact unmanaged-content preservation during one-time prepend.
- Byte-for-byte preservation of an already installed editable managed block.
- Malformed, reversed, and duplicate marker handling.
- Executor atomic per-file writes and accurate partial-failure reporting.
- CLI selection, empty selection, grouped review, replacement warning,
  confirmation, declined confirmation, template reminder, and cancellation
  through a deterministic prompt adapter.
- Acceptance tests for both initial resources and their installed paths.

Release verification includes:

- Prettier format checking.
- Type checking and compilation.
- The full Vitest suite.
- `pnpm pack --dry-run --json` inspection to verify the publish allowlist.
- Packing the real tarball and invoking it through npx, `pnpm dlx`, modern
  `yarn dlx`, and bunx from separate temporary target projects to verify
  executable wiring, Node-shebang behavior, and bundled-resource lookup.
- GitHub Actions on Node 22 and Node 24 running the build, tests, and package
  verification. CI installs dependencies with pnpm and the frozen lockfile.

## Implementation Stages

Implementation proceeds in the following order. Each stage must leave a
reviewable, independently verified result before the next stage begins. Each
stage is delivered as one layer in a GitHub stacked-PR stack, and each layer
contains commits at every meaningful, independently understandable change.

### Stacked-PR delivery contract

- Use GitHub's `github/gh-stack` CLI extension and its `gh stack` command. The
  optional `gs` alias may be configured, but instructions and automation must
  not depend on the alias existing.
- Before implementation, verify that GitHub's stacked-PR private preview is
  enabled for the repository and that the installed extension exposes the
  expected `init`, `add`, `push`, and `submit` commands. If the feature is not
  enabled, stop and request direction instead of silently switching workflows.
- Create and push an empty initialization commit on `main` only when required
  to give the new remote repository a stable base branch. No product or
  configuration change goes directly to `main`.
- Start Stage 1 with `gh stack init foundation`.
- Start each later stage from the preceding layer with:
  - Stage 2: `gh stack add resource-catalog`
  - Stage 3: `gh stack add installation-planner`
  - Stage 4: `gh stack add plan-executor`
  - Stage 5: `gh stack add interactive-cli`
  - Stage 6: `gh stack add package-verification`
- At the end of every stage, run that layer's focused verification plus all
  tests inherited from lower layers. Then use `gh stack push` and
  `gh stack submit` so the stage has its own PR based on the preceding layer.
- Keep each commit cohesive and passing. A meaningful change includes its
  focused tests in the same commit; do not accumulate an entire stage into one
  large commit, and do not create mechanical checkpoint commits with no
  reviewable purpose.
- PR descriptions state the stage goal, summarize commits, list verification
  evidence, and identify the previous and next stack layers.
- Do not merge any layer during implementation. The completed stack is handed
  to the user for review and merge through GitHub's stacked-PR interface.

### Stage 1: Repository and package foundation

- Initialize the Git repository and npm package.
- Configure TypeScript ESM, Node `>=22`, pnpm 11.15.1, Vitest, Prettier, package
  scripts, the executable `bin` entry, and the npm publish allowlist.
- Add the repository README, MIT license, real root `AGENTS.md`, and initial CI
  workflow.
- Prove the empty CLI entry builds and launches from compiled output.
- Commit the foundation in cohesive changes such as package/tooling setup,
  repository documentation, and CI rather than one stage-sized commit.
- Submit the `foundation` stacked PR only after its focused checks pass.

### Stage 2: Resource catalog and initial content

- Define the resource metadata types and runtime validation rules test-first.
- Implement bundled catalog discovery independently of the caller's working
  directory.
- Add the frontend structure guide and editable agent-project guide template
  with valid `resource.json` files.
- Verify both resources load from source and compiled package layouts.
- Commit metadata validation, catalog discovery, and each initial resource as
  independently reviewable changes with their focused tests.
- Submit the `resource-catalog` stacked PR on top of `foundation`.

### Stage 3: Side-effect-free installation planning

- Implement destination resolution and project-containment checks test-first.
- Add symbolic-link rejection before content planning.
- Implement marker generation and strict marker-state detection.
- Produce every approved operation classification without writing to disk.
- Verify replacement conflicts and byte-for-byte preservation of already
  installed editable blocks.
- Commit path safety, marker handling, and operation planning as cohesive
  tested changes.
- Submit the `installation-planner` stacked PR on top of `resource-catalog`.

### Stage 4: Safe plan execution

- Implement temporary-sibling writes and atomic per-file renames test-first.
- Create planned parent directories only during execution.
- Stop on the first failed operation and return exact completed and failed
  operation details.
- Verify creation, prepend, replacement, and partial-failure reporting in
  isolated temporary projects.
- Commit atomic file execution and failure reporting as separate meaningful
  tested changes when their interfaces permit independent review.
- Submit the `plan-executor` stacked PR on top of `installation-planner`.

### Stage 5: Interactive CLI orchestration

- Define the prompt interface and implement its `@clack/prompts` adapter.
- Add checkbox selection, grouped review output, replacement warnings, one
  confirmation, cancellation, result summaries, and template reminders.
- Test orchestration with a deterministic prompt adapter rather than relying on
  a real terminal.
- Connect catalog, planner, and executor through the executable entry.
- Commit the prompt seam, review rendering, orchestration, and executable
  wiring as cohesive tested changes.
- Submit the `interactive-cli` stacked PR on top of `plan-executor`.

### Stage 6: Package and release verification

- Run the Prettier format check, type checking, build, and the full test suite.
- Inspect `pnpm pack --dry-run --json` and correct the package allowlist.
- Build a real tarball and run it through npx, `pnpm dlx`, modern `yarn dlx`,
  and bunx from separate temporary target projects.
- Verify both initial resource installations and the editable `AGENTS.md`
  rerun behavior through the packed artifact.
- Confirm CI covers Node 22 and Node 24.
- Recheck npm package-name availability immediately before publication; actual
  npm publication remains a separate, explicitly authorized action.
- Commit package allowlist and smoke-test automation separately from release
  documentation when both are independently reviewable.
- Submit the `package-verification` stacked PR on top of `interactive-cli` and
  hand off the complete, unmerged stack.

## Deferred Work

A later design may add `list`, `add`, `update`, `remove`, or inspection
commands. At that point, evaluate a committed root `.project-blueprints.json`
manifest containing a schema version, installed resource versions, destination
paths, and content checksums.

The manifest is intentionally absent from the MVP. Without update or removal
commands it would add stale state without providing enough value. Any future
update design must explicitly preserve editable regions and user changes; it
must not reinterpret the MVP's one-time managed markers as permission to
overwrite an edited block.

A server or remote catalog is also deferred until resources need to update
independently of CLI releases, community submissions require an API, or a web
interface is introduced.

## Acceptance Criteria

The MVP is complete when:

1. Each supported launcher opens the same interactive checkbox selection from
   the published package:
   - `npx project-blueprints@latest`
   - `pnpm dlx project-blueprints@latest`
   - `yarn dlx project-blueprints@latest` with modern Yarn
   - `bunx project-blueprints@latest`
2. The two bundled resources appear with correct labels and descriptions.
3. The planner displays the entire filesystem effect before any write.
4. One confirmation approves or declines the whole displayed plan.
5. Decline, empty selection, and pre-execution cancellation leave the target
   unchanged.
6. The frontend guide installs at
   `docs/project-guides/frontend-project-structure.md`.
7. The agent template creates or prepends root `AGENTS.md` with stable markers.
8. Rerunning preserves an edited installed agent-template block byte-for-byte
   and does not duplicate it.
9. Existing unrelated content in `AGENTS.md` remains unchanged below the
   prepended block.
10. Different standalone destination content is shown as a replacement conflict
    and is never replaced without the reviewed all-in-one confirmation.
11. Unsafe paths, symbolic-link destinations, malformed markers, and invalid
    catalog metadata fail safely.
12. The npm tarball contains the runtime and resources but excludes development
    artifacts.
13. Tests, build, package inspection, all four launcher smoke tests, and CI pass
    on the supported Node versions.
