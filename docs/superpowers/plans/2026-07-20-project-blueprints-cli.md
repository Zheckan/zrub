# Project Blueprints CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and package the interactive `project-blueprints` CLI with two bundled resources, safe previewed installation, and verified execution through npm, pnpm, Yarn, and Bun launchers.

**Architecture:** A catalog module validates bundled resource metadata, a side-effect-free planner classifies all target filesystem operations, an executor applies only an approved plan, and a thin CLI coordinates terminal interaction through an injected prompt interface. Implementation is delivered as six GitHub stacked-PR layers, with cohesive passing commits inside every layer.

**Tech Stack:** Node.js >=22, TypeScript ESM, pnpm 11.15.1, `@clack/prompts` 1.7.0, Vitest, Prettier, GitHub Actions, and `github/gh-stack` 0.0.8.

## Global Constraints

- The remote repository is the existing private repository `Zheckan/project-blueprints`.
- Use pnpm 11.15.1 for dependency installation and repository scripts; commit `pnpm-lock.yaml` and never create `package-lock.json` or `yarn.lock`.
- The published CLI must require Node.js `>=22` and use native ESM with a `#!/usr/bin/env node` executable.
- The default command is interactive; do not add MVP subcommands.
- Publishable catalog content lives in `resources/`; development documentation lives in `docs/`.
- Never write target-project files before showing the complete plan and receiving one confirmation.
- `managed-prepend-once` blocks are editable and must be preserved byte-for-byte after installation.
- Do not add an installation manifest in the MVP; record it only as deferred work.
- Do not publish to npm during implementation. Recheck the package name, pack locally, and stop before `pnpm publish`.
- Every stage is one stacked PR. Every meaningful independently understandable change is a cohesive passing commit; never put an entire stage into one commit.
- Do not merge the stack. Hand all six open PRs to the user.

## Locked File Map

```text
.github/workflows/ci.yml              # Node 22/24 build, tests, package checks
.gitignore                            # Node, build, editor, and tarball ignores
.prettierignore                       # Generated and packed files excluded from formatting
.prettierrc.json                      # Repository formatting rules
AGENTS.md                             # Real instructions and shared findings for this repository
LICENSE                               # MIT license
README.md                             # User installation and contributor documentation
package.json                          # npm metadata, bin, scripts, dependencies, publish allowlist
pnpm-lock.yaml                        # pnpm 11.15.1 dependency lock
tsconfig.json                         # Strict editor/test TypeScript configuration
tsconfig.build.json                   # Runtime-only compilation to dist/
vitest.config.ts                      # Vitest configuration
src/cli.ts                            # Executable entry and top-level error handling
src/catalog/types.ts                  # Catalog definitions and loaded-resource types
src/catalog/validate-resource.ts      # Runtime metadata validation
src/catalog/load-catalog.ts           # Catalog discovery and payload resolution
src/catalog/bundled-root.ts           # Package-relative resources/ resolution
src/installer/types.ts                # Plan operation and execution result interfaces
src/installer/destination.ts          # Destination resolution and symlink safety
src/installer/managed-block.ts        # Marker creation and strict inspection
src/installer/plan-installation.ts    # Read-only installation planning
src/installer/apply-plan.ts           # Atomic per-file plan execution
src/cli/ui.ts                         # Prompt/output interface and cancellation token
src/cli/clack-ui.ts                   # @clack/prompts adapter
src/cli/format-review.ts              # Stable grouped review rendering
src/cli/run-cli.ts                    # Injectable CLI orchestration
resources/frontend-project-structure/resource.json
resources/frontend-project-structure/frontend-project-structure.md
resources/agents-project-guide/resource.json
resources/agents-project-guide/AGENTS.md
tests/catalog/validate-resource.test.ts
tests/catalog/load-catalog.test.ts
tests/catalog/bundled-catalog.test.ts
tests/installer/destination.test.ts
tests/installer/managed-block.test.ts
tests/installer/plan-installation.test.ts
tests/installer/apply-plan.test.ts
tests/cli/format-review.test.ts
tests/cli/run-cli.test.ts
tests/cli/clack-ui.test.ts
tests/helpers/temp-project.ts
scripts/verify-package-contents.mjs      # npm tarball allowlist verification
scripts/smoke-packed-cli.mjs           # Four-launcher packed artifact smoke test
docs/superpowers/specs/2026-07-20-project-blueprints-cli-design.md
docs/superpowers/plans/2026-07-20-project-blueprints-cli.md
```

## Stage 0: Remote and Stack Preflight

This is bootstrap work, not a product PR layer.

- [ ] **Step 1: Verify the authenticated account, private remote, and stack extension**

Run outside the restricted network sandbox:

```sh
gh auth status
gh repo view Zheckan/project-blueprints --json nameWithOwner,visibility,url
gh stack --version
gh stack init --help
gh stack add --help
gh stack push --help
gh stack submit --help
```

Expected: authenticated as `Zheckan`; repository visibility is `PRIVATE`; all four stack commands are available. If GitHub reports that stacked PRs are not enabled for this repository, stop and ask the user rather than switching workflows.

- [ ] **Step 2: Initialize the local repository and empty trunk**

Run:

```sh
git init -b main
git remote add origin git@github.com:Zheckan/project-blueprints.git
git commit --allow-empty -m "chore: initialize repository"
git push -u origin main
gh stack init foundation
```

Expected: `main` contains only the empty initialization commit; current branch is the first stack layer named `foundation`; the existing spec and plan remain untracked until the foundation documentation commit.

## Stage 1: Repository and Package Foundation — `foundation`

### Task 1: Configure pnpm, TypeScript, tests, formatting, and the executable

**Files:**
- Create: `package.json`
- Create: `pnpm-lock.yaml`
- Create: `tsconfig.json`
- Create: `tsconfig.build.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.prettierignore`
- Create: `.prettierrc.json`
- Create: `src/cli.ts`

**Interfaces:**
- Produces: executable `dist/cli.js` selected by `package.json#bin.project-blueprints`.
- Produces: repository commands `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm format`, and `pnpm format:check`.

- [ ] **Step 1: Create the package and tool configuration**

Create `package.json` with this effective content; dependency versions are exact and pnpm generates the lockfile:

```json
{
  "name": "project-blueprints",
  "version": "0.1.0",
  "description": "Install reusable engineering guides, prompts, templates, examples, and code into projects.",
  "type": "module",
  "license": "MIT",
  "packageManager": "pnpm@11.15.1",
  "engines": { "node": ">=22" },
  "bin": { "project-blueprints": "dist/cli.js" },
  "files": ["dist", "resources", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "prepack": "pnpm run build"
  },
  "dependencies": { "@clack/prompts": "1.7.0" },
  "devDependencies": {
    "@types/node": "22.20.1",
    "@yarnpkg/cli-dist": "4.17.1",
    "prettier": "3.9.5",
    "typescript": "7.0.2",
    "vitest": "4.1.10"
  }
}
```

Create strict TypeScript configs. `tsconfig.json` covers runtime, tests, scripts, and config files without emitting. `tsconfig.build.json` includes only `src/**/*.ts`, sets `rootDir` to `src`, `outDir` to `dist`, and enables emit. Both use `module` and `moduleResolution` set to `NodeNext`, `target` `ES2022`, `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `verbatimModuleSyntax: true`, and Node types.

Create `vitest.config.ts` with Node environment and test include `tests/**/*.test.ts`. Create `.prettierrc.json` as:

```json
{ "singleQuote": true, "trailingComma": "all" }
```

Ignore `dist`, `node_modules`, `coverage`, `*.tgz`, and `.DS_Store` in both Git and Prettier as appropriate.

- [ ] **Step 2: Install exactly through pnpm and generate the lockfile**

Run:

```sh
pnpm self-update 11.15.1
pnpm --version
pnpm install
pnpm exec tsc --version
pnpm exec vitest --version
```

Expected: `self-update` confirms the repository pin and the next pnpm command automatically switches to `11.15.1`; `pnpm-lock.yaml` exists; no other package-manager lockfile exists; and all tools report versions successfully. Do not install dependencies or generate a lockfile until `pnpm --version` prints exactly `11.15.1`.

- [ ] **Step 3: Add the initial executable and prove compilation**

Create `src/cli.ts`:

```ts
#!/usr/bin/env node

process.stdout.write('Project Blueprints\n');
```

Run:

```sh
pnpm format
pnpm typecheck
pnpm build
node dist/cli.js
```

Expected: all checks pass and the final command prints `Project Blueprints`.

- [ ] **Step 4: Commit the working package foundation**

```sh
git add package.json pnpm-lock.yaml tsconfig.json tsconfig.build.json vitest.config.ts .gitignore .prettierignore .prettierrc.json src/cli.ts
git commit -m "chore: configure TypeScript CLI package"
```

### Task 2: Add repository documentation and agent guidance

**Files:**
- Create: `README.md`
- Create: `AGENTS.md`
- Create: `LICENSE`
- Add: `docs/superpowers/specs/2026-07-20-project-blueprints-cli-design.md`
- Add: `docs/superpowers/plans/2026-07-20-project-blueprints-cli.md`

**Interfaces:**
- Produces: contributor instructions based exclusively on pnpm.
- Produces: root `AGENTS.md` with an editable `Findings` knowledge section.

- [ ] **Step 1: Write README and repository AGENTS guidance**

README must document all four user launchers, Node `>=22`, modern Yarn requirement, supported resource kinds, the interactive preview/confirmation contract, pnpm development commands, and the fact that npm publication has not happened yet.

Root `AGENTS.md` must contain these concrete sections:

```md
# Project Blueprints

This repository builds the `project-blueprints` npm CLI. Publishable resources live in `resources/`; documentation about developing this repository lives in `docs/`. Runtime code lives in `src/`, and behavior is verified through `tests/`.

## Working in this repository

- Use pnpm only. Do not create npm, Yarn, or Bun lockfiles.
- Keep the CLI orchestration thin; filesystem decisions belong in the installer planner.
- Treat resource metadata as untrusted input and keep every resolved path inside its declared root.
- Preserve editable managed blocks byte-for-byte after their first installation.
- Before claiming success, run `pnpm format:check`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

## Findings

Record concise, verified, project-wide surprises, recurring sources of confusion, and non-obvious constraints here. Do not use this section as a work log. Never record secrets. Correct or remove stale findings.
```

Add the approved design and this plan unchanged under `docs/superpowers/`.

- [ ] **Step 2: Add the MIT license**

Create `LICENSE` using the standard MIT text with `Copyright (c) 2026 Zheckan`.

- [ ] **Step 3: Verify and commit documentation**

Run:

```sh
pnpm format
pnpm format:check
```

Expected: PASS.

Commit:

```sh
git add README.md AGENTS.md LICENSE docs/superpowers
git commit -m "docs: define project and implementation guidance"
```

### Task 3: Add the initial CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: pnpm scripts from Task 1.
- Produces: Node 22 and Node 24 verification on pushes and pull requests.

- [ ] **Step 1: Create CI**

Create a workflow named `CI` triggered by `push` and `pull_request`. Its matrix is Node `[22, 24]`; steps are checkout, `pnpm/action-setup@v4` with version `11.15.1`, `actions/setup-node@v4` with pnpm cache, `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

- [ ] **Step 2: Run the same checks locally**

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 3: Commit and submit Stage 1**

```sh
git add .github/workflows/ci.yml
git commit -m "ci: verify supported Node versions"
gh stack push
gh stack submit
```

Expected: a `foundation` PR targets `main` and contains three cohesive commits. Record its URL before starting Stage 2.

## Stage 2: Resource Catalog and Initial Content — `resource-catalog`

Start the layer:

```sh
gh stack add resource-catalog
```

### Task 4: Define and validate resource metadata

**Files:**
- Create: `src/catalog/types.ts`
- Create: `src/catalog/validate-resource.ts`
- Create: `tests/catalog/validate-resource.test.ts`

**Interfaces:**
- Produces: `validateResourceDefinition(input: unknown): ResourceDefinition`.
- Produces: `ResourceDefinition`, `ResourceFileDefinition`, `ResourceKind`, `ExistingFilePolicy`, `LoadedResource`, and `LoadedResourceFile`.

- [ ] **Step 1: Write failing validation tests**

Define a valid metadata fixture in the test and table-test rejection of: non-object input, schema versions other than `1`, empty or malformed IDs, empty names/descriptions, unknown kinds, empty files, absolute/traversing source paths, absolute/traversing destinations, unknown `onExisting`, and `managed-prepend-once` applied to a non-Markdown source or exact non-Markdown destination.

The success assertion must equal:

```ts
expect(validateResourceDefinition(valid)).toEqual(valid);
```

Every invalid case must assert a stable prefix:

```ts
expect(() => validateResourceDefinition(input)).toThrowError(
  /^Invalid resource metadata:/,
);
```

- [ ] **Step 2: Run the test to verify RED**

```sh
pnpm test -- tests/catalog/validate-resource.test.ts
```

Expected: FAIL because `validateResourceDefinition` does not exist.

- [ ] **Step 3: Implement metadata types and validation**

Create the public definitions:

```ts
export const RESOURCE_KINDS = [
  'guide',
  'prompt',
  'template',
  'example',
  'code',
] as const;

export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export type ExistingFilePolicy = 'managed-prepend-once';

export interface ResourceFileDefinition {
  source: string;
  destination: string;
  onExisting?: ExistingFilePolicy;
}

export interface ResourceDefinition {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  kind: ResourceKind;
  files: ResourceFileDefinition[];
}

export interface LoadedResourceFile extends ResourceFileDefinition {
  sourcePath: string;
}

export interface LoadedResource extends ResourceDefinition {
  directoryPath: string;
  files: LoadedResourceFile[];
}
```

Implement manual runtime validation without adding a schema dependency. IDs must match `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`. Source and destination strings must be non-empty, relative, contain no `..` segment, and use forward slashes in metadata. A directory destination ending in `/` derives its extension from the source for the Markdown-policy check.

- [ ] **Step 4: Verify GREEN and commit**

```sh
pnpm test -- tests/catalog/validate-resource.test.ts
pnpm typecheck
git add src/catalog/types.ts src/catalog/validate-resource.ts tests/catalog/validate-resource.test.ts
git commit -m "feat: validate resource metadata"
```

Expected: focused test and typecheck pass.

### Task 5: Load resources and resolve the bundled catalog

**Files:**
- Create: `src/catalog/load-catalog.ts`
- Create: `src/catalog/bundled-root.ts`
- Create: `tests/catalog/load-catalog.test.ts`
- Create: `tests/helpers/temp-project.ts`

**Interfaces:**
- Consumes: `validateResourceDefinition` and catalog types.
- Produces: `loadCatalog(resourcesRoot: string): Promise<LoadedResource[]>`.
- Produces: `bundledResourcesRoot(metaUrl?: string): string`.
- Produces for tests: `withTempDirectory(run: (directory: string) => Promise<void>): Promise<void>`.

- [ ] **Step 1: Write failing loader tests**

Tests must create temporary catalog folders and cover: deterministic alphabetical ordering by resource ID, malformed JSON, duplicate IDs, missing `resource.json`, missing payload file, payload source escaping its resource directory, and a valid multi-file resource.

The happy-path shape must include absolute `directoryPath` and `sourcePath` fields while preserving metadata values.

- [ ] **Step 2: Verify RED**

```sh
pnpm test -- tests/catalog/load-catalog.test.ts
```

Expected: FAIL because the loader is absent.

- [ ] **Step 3: Implement catalog discovery**

`loadCatalog` must use `readdir({ withFileTypes: true })`, accept only directories as resources, parse each `resource.json`, validate it, resolve every payload under that resource directory, verify each payload is a regular file through `lstat`, reject duplicate IDs, and sort the returned resources by ID.

Create package-relative root resolution:

```ts
import { fileURLToPath } from 'node:url';

export function bundledResourcesRoot(metaUrl = import.meta.url): string {
  return fileURLToPath(new URL('../../resources/', metaUrl));
}
```

This relative shape must work from both `src/catalog` and compiled `dist/catalog`.

- [ ] **Step 4: Verify GREEN and commit**

```sh
pnpm test -- tests/catalog/load-catalog.test.ts
pnpm typecheck
git add src/catalog/load-catalog.ts src/catalog/bundled-root.ts tests/catalog/load-catalog.test.ts tests/helpers/temp-project.ts
git commit -m "feat: load bundled resource catalog"
```

### Task 6: Add the two initial resources

**Files:**
- Create: `resources/frontend-project-structure/resource.json`
- Create: `resources/frontend-project-structure/frontend-project-structure.md`
- Create: `resources/agents-project-guide/resource.json`
- Create: `resources/agents-project-guide/AGENTS.md`
- Create: `tests/catalog/bundled-catalog.test.ts`

**Interfaces:**
- Produces: the complete MVP catalog consumed by the CLI.

- [ ] **Step 1: Write the failing bundled-catalog acceptance test**

The test must load `bundledResourcesRoot()` and assert exactly these definitions:

```ts
expect(
  resources.map(({ id, kind, files }) => ({
    id,
    kind,
    files: files.map(({ source, destination, onExisting }) => ({
      source,
      destination,
      onExisting,
    })),
  })),
).toEqual([
  {
    id: 'agents-project-guide',
    kind: 'template',
    files: [
      {
        source: 'AGENTS.md',
        destination: './',
        onExisting: 'managed-prepend-once',
      },
    ],
  },
  {
    id: 'frontend-project-structure',
    kind: 'guide',
    files: [
      {
        source: 'frontend-project-structure.md',
        destination: 'docs/project-guides/frontend-project-structure.md',
        onExisting: undefined,
      },
    ],
  },
]);
```

- [ ] **Step 2: Verify RED**

```sh
pnpm test -- tests/catalog/bundled-catalog.test.ts
```

Expected: FAIL because resources do not exist.

- [ ] **Step 3: Add resource metadata and payloads**

Use the metadata from the design. Copy the complete user-supplied frontend guide verbatim into `frontend-project-structure.md`.

Create the editable agent template with this content:

```md
## Project overview

<!-- Replace this comment with the project's purpose, users, and high-level shape. -->

## Important paths and conventions

<!-- Replace this comment with repository-specific paths and conventions. -->

## Development and verification

<!-- Replace this comment with setup, development, test, build, and validation commands. -->

## Findings

Record concise, verified, project-wide surprises, recurring sources of confusion, and non-obvious constraints here. Do not use this section as a work log. Never record secrets. Correct or remove stale findings.
```

- [ ] **Step 4: Verify and commit each resource meaningfully**

```sh
pnpm test -- tests/catalog/bundled-catalog.test.ts
git add resources/frontend-project-structure tests/catalog/bundled-catalog.test.ts
git commit -m "feat: add frontend structure guide"
git add resources/agents-project-guide tests/catalog/bundled-catalog.test.ts
git commit -m "feat: add agent project guide template"
```

Before the first commit, stage only the frontend expectation and resource. Amend the test in the second commit to assert the final two-resource catalog, keeping both commits passing.

- [ ] **Step 5: Verify and submit Stage 2**

```sh
pnpm format
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
gh stack push
gh stack submit
```

Expected: all checks pass and `resource-catalog` is a stacked PR based on `foundation`.

## Stage 3: Side-Effect-Free Installation Planning — `installation-planner`

Start the layer:

```sh
gh stack add installation-planner
```

### Task 7: Resolve destinations and reject unsafe paths

**Files:**
- Create: `src/installer/destination.ts`
- Create: `tests/installer/destination.test.ts`

**Interfaces:**
- Produces: `resolveDestination(targetRoot: string, file: LoadedResourceFile): string`.
- Produces: `assertSafeDestination(targetRoot: string, destinationPath: string): Promise<void>`.

- [ ] **Step 1: Write failing destination tests**

Cover exact-file destinations, directory destinations preserving the source basename, normalization without escape, absolute destination rejection, `..` rejection, sibling-prefix attacks such as target `/tmp/app` and result `/tmp/application`, a symbolic-link target root, existing destination symlinks, and symlinked ancestor directories. Reject every symbolic-link segment from the target root through the destination.

- [ ] **Step 2: Verify RED**

```sh
pnpm test -- tests/installer/destination.test.ts
```

Expected: FAIL because destination functions are absent.

- [ ] **Step 3: Implement resolution and safety**

Directory destinations are detected by a trailing `/` and append `basename(file.source)`. Exact destinations remain literal. Resolve against `path.resolve(targetRoot)` and verify containment with:

```ts
const relative = path.relative(resolvedTargetRoot, resolvedDestination);
if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
  throw new Error(`Unsafe destination outside target project: ${file.destination}`);
}
```

For each existing segment from the target root down to and including the destination, use `lstat`; reject symbolic links. Treat `ENOENT` as the first missing segment and stop walking because lower segments cannot yet exist. Propagate other filesystem errors.

- [ ] **Step 4: Verify and commit**

```sh
pnpm test -- tests/installer/destination.test.ts
pnpm typecheck
git add src/installer/destination.ts tests/installer/destination.test.ts
git commit -m "feat: validate installation destinations"
```

### Task 8: Generate and inspect one-time managed blocks

**Files:**
- Create: `src/installer/managed-block.ts`
- Create: `tests/installer/managed-block.test.ts`

**Interfaces:**
- Produces: `managedMarkers(resourceId: string): { start: string; end: string }`.
- Produces: `wrapManagedBlock(resourceId: string, content: string): string`.
- Produces: `inspectManagedBlock(resourceId: string, content: string): ManagedBlockState`.
- `ManagedBlockState` is `{ kind: 'absent' } | { kind: 'installed'; startIndex: number; endIndex: number } | { kind: 'malformed'; reason: string }`.

- [ ] **Step 1: Write failing marker tests**

Cover stable marker strings, exactly one valid block, no block, start without end, end without start, reversed markers, duplicate start, duplicate end, and two complete blocks. Verify that edits inside one valid block still classify as `installed`.

- [ ] **Step 2: Verify RED**

```sh
pnpm test -- tests/installer/managed-block.test.ts
```

Expected: FAIL because marker helpers are absent.

- [ ] **Step 3: Implement strict marker handling**

Marker generation must be exactly:

```ts
export function managedMarkers(resourceId: string) {
  return {
    start: `<!-- project-blueprints:${resourceId}:start -->`,
    end: `<!-- project-blueprints:${resourceId}:end -->`,
  } as const;
}

export function wrapManagedBlock(resourceId: string, content: string): string {
  const { start, end } = managedMarkers(resourceId);
  const normalized = content.endsWith('\n') ? content : `${content}\n`;
  return `${start}\n${normalized}${end}\n`;
}
```

Inspection must count exact marker occurrences before comparing their order. Only one start followed by one end is installed; every other non-absent state is malformed.

- [ ] **Step 4: Verify and commit**

```sh
pnpm test -- tests/installer/managed-block.test.ts
pnpm typecheck
git add src/installer/managed-block.ts tests/installer/managed-block.test.ts
git commit -m "feat: detect managed resource blocks"
```

### Task 9: Build complete installation plans without writes

**Files:**
- Create: `src/installer/types.ts`
- Create: `src/installer/plan-installation.ts`
- Create: `tests/installer/plan-installation.test.ts`

**Interfaces:**
- Consumes: loaded resources, destination safety, and managed-block helpers.
- Produces: `planInstallation(resources: LoadedResource[], targetRoot: string): Promise<InstallationPlan>`.
- Produces: plan and operation types consumed unchanged by the executor and CLI.

- [ ] **Step 1: Define expected public plan types in the failing test**

Use this interface contract:

```ts
export type InstallationOperationKind =
  | 'create'
  | 'prepend'
  | 'replace-conflict'
  | 'unchanged'
  | 'already-installed'
  | 'malformed-markers-conflict';

export interface InstallationOperation {
  resourceId: string;
  sourcePath: string;
  destinationPath: string;
  kind: InstallationOperationKind;
  nextContent?: string;
  conflictReason?: string;
  template: boolean;
}

export interface InstallationPlan {
  targetRoot: string;
  operations: InstallationOperation[];
  hasReplacementConflicts: boolean;
  hasBlockingConflicts: boolean;
}
```

Table-test all six operations. Also assert: selected resource order then file order is stable; no target files or parent directories are created; missing managed targets receive wrapped content; prepend content is `wrappedBlock + "\n" + existingContent`; an installed block is preserved without comparing payload content; malformed markers make `hasBlockingConflicts` true; and different unmanaged content makes only `hasReplacementConflicts` true.

- [ ] **Step 2: Verify RED**

```sh
pnpm test -- tests/installer/plan-installation.test.ts
```

Expected: FAIL because the planner is absent.

- [ ] **Step 3: Implement read-only planning**

For each selected file: resolve and validate the destination, read payload as UTF-8, inspect the target with `lstat`, and classify it. `nextContent` must exist only on `create`, `prepend`, and `replace-conflict`. `template` is `resource.kind === 'template'`.

Classification order for `managed-prepend-once` is: missing target -> wrapped `create`; existing non-regular file -> error; malformed markers -> blocking conflict; installed markers -> already installed; absent markers -> prepend. Classification without a policy is: missing -> create; equal UTF-8 content -> unchanged; different -> replacement conflict.

- [ ] **Step 4: Verify planner invariants and commit**

```sh
pnpm test -- tests/installer/plan-installation.test.ts
pnpm test -- tests/installer
pnpm typecheck
git add src/installer/types.ts src/installer/plan-installation.ts tests/installer/plan-installation.test.ts
git commit -m "feat: plan resource installations"
```

- [ ] **Step 5: Verify and submit Stage 3**

```sh
pnpm format
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
gh stack push
gh stack submit
```

Expected: `installation-planner` is a passing stacked PR based on `resource-catalog`.

## Stage 4: Safe Plan Execution — `plan-executor`

Start the layer:

```sh
gh stack add plan-executor
```

### Task 10: Apply approved write operations atomically per file

**Files:**
- Create: `src/installer/apply-plan.ts`
- Create: `tests/installer/apply-plan.test.ts`

**Interfaces:**
- Consumes: `InstallationPlan` from Stage 3.
- Produces: `applyInstallationPlan(plan: InstallationPlan): Promise<ExecutionResult>`.
- Produces: `ExecutionResult` with status, completed operations, optional failed operation, and error.

- [ ] **Step 1: Write failing executor tests**

Add this result contract to `src/installer/types.ts` through the implementation step:

```ts
export type ExecutionResult =
  | {
      status: 'completed';
      completed: InstallationOperation[];
    }
  | {
      status: 'failed';
      completed: InstallationOperation[];
      failed: InstallationOperation;
      error: Error;
    };
```

Tests must prove: blocking plans are rejected before writes; `create`, `prepend`, and approved `replace-conflict` contents are written; unchanged and already-installed operations are skipped; parent directories are created; files left by a successful operation contain no temporary-name suffix; a forced later failure returns the earlier completed operation and exact failed operation; and the failed operation's temporary sibling is removed.

Use dependency injection for deterministic failure rather than filesystem permission tricks:

```ts
export interface FileWriter {
  writeAtomically(destinationPath: string, content: string): Promise<void>;
}
```

`applyInstallationPlan` accepts an optional `FileWriter`, defaulting to the real adapter.

- [ ] **Step 2: Verify RED**

```sh
pnpm test -- tests/installer/apply-plan.test.ts
```

Expected: FAIL because executor interfaces are absent.

- [ ] **Step 3: Implement atomic per-file writes**

The real writer must create the parent directory recursively, create a randomized temporary sibling with exclusive mode, write UTF-8 content, close it, and rename it over the destination. On any error after temporary creation, close if necessary and unlink only that explicit temporary path before rethrowing.

Use a temporary filename derived from destination basename, process ID, and `randomUUID()`; never use a broad glob for cleanup. Re-run `assertSafeDestination` immediately before each write so the approved path is checked again at execution time.

Executor rules:

```ts
const writableKinds = new Set(['create', 'prepend', 'replace-conflict']);
```

Throw before execution when `plan.hasBlockingConflicts` is true. For every writable operation, require `nextContent` and execute in plan order. Return the discriminated result instead of throwing after an individual operation fails.

- [ ] **Step 4: Verify and commit atomic execution**

```sh
pnpm test -- tests/installer/apply-plan.test.ts
pnpm test -- tests/installer
pnpm typecheck
git add src/installer/types.ts src/installer/apply-plan.ts tests/installer/apply-plan.test.ts
git commit -m "feat: apply approved installation plans"
```

### Task 11: Verify the planner-executor acceptance path

**Files:**
- Modify: `tests/installer/apply-plan.test.ts`

**Interfaces:**
- Consumes: real planner and executor together.
- Produces: regression coverage for the target-project behavior users receive.

- [ ] **Step 1: Add end-to-end filesystem tests at the module interface**

Create real temporary target projects and assert:

1. Planning then applying the frontend guide creates the nested destination.
2. Planning then applying the agent guide prepends existing `AGENTS.md` content exactly below the managed block.
3. Editing Project overview and Findings inside the installed block, replanning, and reapplying produces `already-installed` and leaves the complete file byte-for-byte unchanged.
4. A standalone conflicting guide is replaced only when its `replace-conflict` operation is passed to the executor as part of the approved plan.

- [ ] **Step 2: Run the acceptance tests and commit**

```sh
pnpm test -- tests/installer/apply-plan.test.ts
pnpm typecheck
git add tests/installer/apply-plan.test.ts
git commit -m "test: verify installation lifecycle"
```

- [ ] **Step 3: Verify and submit Stage 4**

```sh
pnpm format
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
gh stack push
gh stack submit
```

Expected: `plan-executor` is a passing stacked PR based on `installation-planner`.

## Stage 5: Interactive CLI Orchestration — `interactive-cli`

Start the layer:

```sh
gh stack add interactive-cli
```

### Task 12: Define the terminal seam and grouped review formatter

**Files:**
- Create: `src/cli/ui.ts`
- Create: `src/cli/format-review.ts`
- Create: `tests/cli/format-review.test.ts`

**Interfaces:**
- Produces: `CANCELLED` token and `UiPort` interface.
- Produces: `formatPlanReview(plan: InstallationPlan, targetRoot: string): ReviewGroup[]`.

- [ ] **Step 1: Define the UI interface**

Use this exact seam:

```ts
import type { LoadedResource } from '../catalog/types.js';

export const CANCELLED = Symbol('cancelled');
export type Cancelled = typeof CANCELLED;

export interface UiPort {
  intro(title: string): void;
  selectResources(resources: LoadedResource[]): Promise<string[] | Cancelled>;
  showReview(groups: ReviewGroup[]): void;
  confirm(message: string): Promise<boolean | Cancelled>;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  outro(message: string): void;
}

export interface ReviewGroup {
  heading: string;
  entries: string[];
  severity: 'normal' | 'warning' | 'blocking';
}
```

- [ ] **Step 2: Write failing review-format tests**

Build a plan containing every operation kind. Assert deterministic group order:

```ts
[
  'CREATE',
  'PREPEND',
  'REPLACE - CONFLICT',
  'UNCHANGED',
  'ALREADY INSTALLED',
  'MALFORMED MARKERS - BLOCKING',
]
```

Entries must use target-root-relative paths with forward slashes and include the resource ID. Empty groups are omitted. Replacement is `warning`; malformed markers is `blocking`; all others are `normal`.

- [ ] **Step 3: Verify RED, implement, and verify GREEN**

```sh
pnpm test -- tests/cli/format-review.test.ts
```

Expected before implementation: FAIL.

Implement the formatter as a pure function with a kind-to-heading/severity map, then run:

```sh
pnpm test -- tests/cli/format-review.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit the terminal interface and formatter**

```sh
git add src/cli/ui.ts src/cli/format-review.ts tests/cli/format-review.test.ts
git commit -m "feat: format installation plan reviews"
```

### Task 13: Orchestrate the complete CLI through injected modules

**Files:**
- Create: `src/cli/run-cli.ts`
- Create: `tests/cli/run-cli.test.ts`

**Interfaces:**
- Consumes: `UiPort`, catalog loader, planner, and executor.
- Produces: `runCli(dependencies: CliDependencies): Promise<number>` where the number is the process exit code.

- [ ] **Step 1: Define dependencies and write failing orchestration tests**

Use:

```ts
export interface CliDependencies {
  targetRoot: string;
  resourcesRoot: string;
  ui: UiPort;
  loadCatalog: typeof loadCatalog;
  planInstallation: typeof planInstallation;
  applyInstallationPlan: typeof applyInstallationPlan;
}
```

Create a recording fake `UiPort`. Tests cover: cancellation at selection, empty selection, unknown selected ID as internal error, grouped review before confirmation, blocking conflict without confirmation, replacement warning before confirmation, cancellation at confirmation, declined confirmation, successful execution summary, partial failure summary and exit code `1`, and template reminder only when a template `create` or `prepend` completed.

Expected exit codes: `0` for cancellation, empty selection, decline, or full success; `1` for validation, planning, or execution failure.

- [ ] **Step 2: Verify RED**

```sh
pnpm test -- tests/cli/run-cli.test.ts
```

Expected: FAIL because `runCli` is absent.

- [ ] **Step 3: Implement the orchestration in the approved order**

The implementation order is fixed:

```ts
ui.intro('Project Blueprints');
const resources = await loadCatalog(resourcesRoot);
const selection = await ui.selectResources(resources);
// cancellation / empty checks
const selectedResources = selection.map((id) => resourceById.get(id));
const plan = await planInstallation(selectedResources, targetRoot);
ui.showReview(formatPlanReview(plan, targetRoot));
// blocking conflict check
// replacement warning
const confirmed = await ui.confirm('Apply this installation plan?');
// cancellation / decline checks
const result = await applyInstallationPlan(plan);
// exact result and template-reminder output
```

Catch expected top-level errors once, display their message without a stack trace, and return `1`. Do not catch programmer errors inside low-level helpers merely to continue.

- [ ] **Step 4: Verify and commit orchestration**

```sh
pnpm test -- tests/cli/run-cli.test.ts
pnpm typecheck
git add src/cli/run-cli.ts tests/cli/run-cli.test.ts
git commit -m "feat: orchestrate interactive installations"
```

### Task 14: Implement the Clack adapter and executable entry

**Files:**
- Create: `src/cli/clack-ui.ts`
- Modify: `src/cli.ts`
- Create: `tests/cli/clack-ui.test.ts`

**Interfaces:**
- Consumes: `UiPort` and all default production modules.
- Produces: real interactive execution from all package launchers.

- [ ] **Step 1: Implement the Clack adapter**

Use `intro`, `multiselect`, `confirm`, `isCancel`, `cancel`, `outro`, `note`, and `log` from `@clack/prompts`. Accept those functions through an internal `ClackFunctions` object defaulted to the real imports so cancellation and option mapping are testable without a terminal. Resource options are:

```ts
{
  value: resource.id,
  label: resource.name,
  hint: `${resource.kind} - ${resource.description}`,
}
```

Set multiselect `required: false`. Convert Clack cancellation into the shared `CANCELLED` token. `showReview` renders every group with `note`; warning and blocking groups also use `log.warn` or `log.error`.

- [ ] **Step 2: Replace the executable stub**

`src/cli.ts` must retain its first-line shebang and wire defaults:

```ts
#!/usr/bin/env node

import { bundledResourcesRoot } from './catalog/bundled-root.js';
import { loadCatalog } from './catalog/load-catalog.js';
import { applyInstallationPlan } from './installer/apply-plan.js';
import { planInstallation } from './installer/plan-installation.js';
import { createClackUi } from './cli/clack-ui.js';
import { runCli } from './cli/run-cli.js';

const exitCode = await runCli({
  targetRoot: process.cwd(),
  resourcesRoot: bundledResourcesRoot(),
  ui: createClackUi(),
  loadCatalog,
  planInstallation,
  applyInstallationPlan,
});

process.exitCode = exitCode;
```

- [ ] **Step 3: Test cancellation mapping and compiled startup**

In `tests/cli/clack-ui.test.ts`, inject fake Clack functions and assert resource option mapping, multiselect cancellation, confirmation cancellation, and routing of normal, warning, and error output. Do not snapshot third-party ANSI escape sequences.

Build and start the compiled CLI from the repository root; submit an empty selection and assert a clean exit with no created files.

Run:

```sh
pnpm format
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
printf '\n' | node dist/cli.js
```

Expected: all pass; `dist/cli.js` begins with the Node shebang and resolves bundled resources.

- [ ] **Step 4: Commit and submit Stage 5**

```sh
git add src/cli.ts src/cli/clack-ui.ts tests/cli/clack-ui.test.ts
git commit -m "feat: add interactive Clack CLI"
gh stack push
gh stack submit
```

Expected: `interactive-cli` is a passing stacked PR based on `plan-executor`.

## Stage 6: Package and Release Verification — `package-verification`

Start the layer:

```sh
gh stack add package-verification
```

### Task 15: Verify the npm tarball allowlist

**Files:**
- Create: `scripts/verify-package-contents.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `pnpm package:check`, which builds a real tarball in a temporary directory, verifies required files, and deletes the temporary directory.

- [ ] **Step 1: Write the failing package verifier**

Implement a Node ESM script using `mkdtemp`, `spawnSync`, `readdir`, and `rm` from Node standard libraries. Invoke packing with:

```js
spawnSync(
  'pnpm',
  ['pack', '--json', '--pack-destination', temporaryDirectory],
  { cwd: repositoryRoot, encoding: 'utf8' },
);
```

Locate the single `.tgz` entry returned by `readdir(temporaryDirectory)`, then invoke `tar` with `['-tzf', tarballPath]`. Assert presence of:

```text
package/package.json
package/README.md
package/LICENSE
package/dist/cli.js
package/resources/frontend-project-structure/resource.json
package/resources/frontend-project-structure/frontend-project-structure.md
package/resources/agents-project-guide/resource.json
package/resources/agents-project-guide/AGENTS.md
```

Assert no entry begins with `package/src/`, `package/tests/`, `package/docs/`, `package/scripts/`, or `package/.github/`. Also read the packed `package.json` through `tar -xOf` and assert its single bin entry is `project-blueprints: dist/cli.js`, engine is `>=22`, and package name is `project-blueprints`.

Always remove only the explicit temporary directory created by the script in a `finally` block.

- [ ] **Step 2: Add and run the package script**

Add:

```json
"package:check": "node scripts/verify-package-contents.mjs"
```

Run:

```sh
pnpm package:check
```

Expected before correcting any allowlist/build issue: FAIL with the exact missing or unexpected package entry. Correct only `package.json#files`, build output, or resource layout required by the spec, then rerun until PASS.

- [ ] **Step 3: Add the package check to both CI matrix jobs and commit**

Append `pnpm package:check` after `pnpm build` in CI. Run:

```sh
pnpm format
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm package:check
git add package.json pnpm-lock.yaml scripts/verify-package-contents.mjs .github/workflows/ci.yml
git commit -m "test: verify published package contents"
```

Expected: all pass.

### Task 16: Smoke-test all four package launchers

**Files:**
- Create: `scripts/smoke-packed-cli.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `pnpm smoke:launchers`.
- Verifies: npx, `pnpm dlx`, Yarn 4.17.1 `dlx`, and bunx 1.3.14 all resolve and execute the same packed Node CLI.

- [ ] **Step 1: Implement the packed-launcher smoke script**

The script must:

1. Create one explicit temporary pack directory and four separate target directories.
2. Spawn pnpm with `['pack', '--pack-destination', packDirectory]` and locate the single `.tgz` file.
3. Prepend the repository's `node_modules/.bin` to the child `PATH` so `yarn`
   resolves to the pinned Yarn 4.17.1 development dependency, then run these
   command arrays from separate target directories:

```js
[
  ['npx', ['--yes', tarballPath]],
  ['pnpm', ['dlx', tarballPath]],
  ['yarn', ['dlx', '--package', tarballPath, 'project-blueprints']],
  ['bunx', ['--package', tarballPath, 'project-blueprints']],
]
```

4. For each child, pipe standard input, write one newline to accept an empty multiselect, and close input.
5. Enforce a 30-second timeout, require exit code `0`, and require output to include `Project Blueprints` plus the CLI's empty-selection completion message.
6. Assert each target directory still contains no installed resource files.
7. On failure, print the launcher name, command, exit code, stdout, and stderr.
8. In `finally`, remove only the explicit temporary root created by the script.

- [ ] **Step 2: Add the launcher script and verify available tools locally**

Add:

```json
"smoke:launchers": "node scripts/smoke-packed-cli.mjs"
```

Verify:

```sh
npx --version
pnpm --version
yarn --version
bunx --version
pnpm smoke:launchers
```

Expected: pnpm is 11.15.1; the smoke script resolves the repository-pinned Yarn 4.17.1 rather than any globally installed Yarn Classic; all four smoke cases pass.

- [ ] **Step 3: Add a dedicated launcher-smoke CI job**

Create a Node 24 Ubuntu job depending on the normal test matrix. Steps:

1. Checkout.
2. `pnpm/action-setup@v4` with pnpm 11.15.1.
3. `actions/setup-node@v4` with Node 24 and pnpm cache.
4. `pnpm install --frozen-lockfile`.
5. Verify the pinned local Yarn with `pnpm exec yarn --version`.
6. `oven-sh/setup-bun@v2` with Bun 1.3.14.
7. Run `pnpm smoke:launchers`.

- [ ] **Step 4: Verify and commit launcher support**

```sh
pnpm format
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm package:check
pnpm smoke:launchers
git add package.json pnpm-lock.yaml scripts/smoke-packed-cli.mjs .github/workflows/ci.yml
git commit -m "test: verify package launcher compatibility"
```

Expected: every command passes.

### Task 17: Final release-readiness documentation and stack handoff

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md` only if a verified project-wide finding arose during implementation.

**Interfaces:**
- Produces: accurate user commands, prerequisites, conflict behavior, and contributor verification instructions.

- [ ] **Step 1: Update README from observed behavior**

Document:

- All four exact `@latest` launcher commands, marked as post-publication commands.
- Node `>=22`; modern Yarn for `yarn dlx`; bunx runs the Node shebang.
- The two initial resources and their destinations.
- The grouped review, single confirmation, replacement warning, and managed-prepend-once preservation rules.
- pnpm 11.15.1 contributor setup and every verification script.
- How to add a resource directory and validate it.
- Deferred manifest/update/remove behavior without promising a release.

Do not claim the npm package is published.

- [ ] **Step 2: Recheck package-name availability without publishing**

Run outside the restricted network sandbox:

```sh
npm view project-blueprints name version --json
```

Expected before publication: npm returns `E404`. If it returns package metadata, stop and report that the name is no longer available. Do not run `pnpm publish`.

- [ ] **Step 3: Run the complete verification suite**

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm package:check
pnpm smoke:launchers
git status --short
```

Expected: every command passes. `git status --short` shows only the intended README or Findings changes before the documentation commit.

- [ ] **Step 4: Commit release documentation**

```sh
git add README.md AGENTS.md
git commit -m "docs: document CLI usage and maintenance"
```

If `AGENTS.md` did not receive a genuine verified finding, omit it from `git add`.

- [ ] **Step 5: Submit and inspect the complete stack**

```sh
gh stack push
gh stack submit
gh stack view
git status --short --branch
```

Expected:

- `package-verification` targets `interactive-cli`.
- The stack contains, bottom to top: `foundation`, `resource-catalog`, `installation-planner`, `plan-executor`, `interactive-cli`, `package-verification`.
- All six PRs are open, CI is passing, and the worktree is clean.
- No layer has been merged and no npm publication has occurred.

## Final Acceptance Review

- [ ] Map every acceptance criterion in the design spec to a passing automated test or recorded packed-launcher smoke result.
- [ ] Inspect each PR diff independently and confirm it contains only its named stage.
- [ ] Confirm every commit is cohesive and passing; split or fix any stage-sized or mechanical checkpoint commit before handoff.
- [ ] Record all six PR URLs and their CI status in the final handoff.
- [ ] Explicitly state that npm publication remains pending user authorization.
