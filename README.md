# Zrub

`zrub` provides reusable engineering guides, prompts, templates, examples, and
code. Install resources into a project, or read their instructions for a
one-time task without installing the documents.

Install from five bundled resources, inspect tracked files, and review updates
and removals. Global skills and automatic repository setup remain future work.

Run one of these commands from the target project's root:

```sh
npx @zheckan/zrub@latest
pnpm dlx @zheckan/zrub@latest
yarn dlx @zheckan/zrub@latest
bunx @zheckan/zrub@latest
```

Node.js 22 or newer is required. `yarn dlx` needs modern Yarn, not Yarn
Classic 1.x. `bunx` invokes the package's Node shebang, so Node.js stays
required when you launch through Bun.

## One-time instructions for agents

Discover resources and receive their instructions without installing them:

```sh
pnpm dlx @zheckan/zrub@latest list
pnpm dlx @zheckan/zrub@latest read typescript-ci-setup
pnpm dlx @zheckan/zrub@latest read github-repo-setup-profile
```

Use `list --json` or `read <resource-id> --json` for structured output. Both
commands run without prompts and leave the target project unchanged. They work
for every resource kind and include all declared sources, including alternate
agent templates. Errors go to stderr and return a nonzero exit code.

For example, ask an agent:

> Set up CI for this project. Run `pnpm dlx @zheckan/zrub@latest read
typescript-ci-setup`, then follow those instructions. Create the workflow in
> `.github/workflows/ci.yml` without saving the guide in `docs/`.

Zrub returns the information; the agent performs the requested work. Reading
does not execute shell commands from the document or change GitHub settings.
"Read-once" describes using instructions for one task. You can read them again;
there is no installation record or execution tracking.

`zrub --help` shows command usage. With no arguments, Zrub opens the interactive
installer described below. The same command arguments work with npx, Yarn dlx,
and bunx.

## Included resources

- **Agent project guide.** The managed section at the top of `AGENTS.md`
  holds a project overview, important conventions, and verification
  commands. It links to zrub's GitHub setup standard, so an agent in any
  project knows the right `gh api` commands without reading other
  repositories. When `AGENTS.md` already exists, only a short zrub block is
  prepended instead of the full template. The guide also installs
  `docs/findings.md`, the findings ledger with its recording rules, and
  `docs/project-guides/zrub.md`, the agent's maintenance manual. Existing
  content stays below the managed section.
  The manual covers reinstallation, managed markers, and links to setup guides.
- **Frontend project structure.**
  `docs/project-guides/frontend-project-structure.md` organizes a React
  codebase around thin pages, feature-owned product logic, reusable domain
  logic, and a shared UI layer.
- **General project guidelines.**
  `read general-project-guidelines` returns a framework-independent guide
  for apps, browser extensions, workers, CLIs, and libraries. It covers
  dependency boundaries, code organization, readability, naming, testing,
  verification, and migration. Installation places it at
  `docs/project-guides/general-project-guidelines.md`.
- **GitHub repository setup profile.**
  `read github-repo-setup-profile` returns a one-time agent runbook that
  applies this project's standard GitHub settings, the `main-protection`
  branch ruleset, and `release-tags` tag protection to a new repository. It
  changes remote configuration when an agent follows it. The guide can also be
  installed at `docs/project-guides/github-repo-setup-profile.md`.
- **TypeScript CI setup.** `read typescript-ci-setup`
  includes complete GitHub Actions examples for separate checks and a shared
  job. Before selecting or changing the layout, the guide requires the agent
  to confirm whether the user prefers individual check results or lower runner
  usage. It also covers caching, cancellation, project prerequisites, and
  required-check migration. The guide can also be installed at
  `docs/project-guides/typescript-ci-setup.md`.

The catalog holds guides, prompts, templates, examples, and code. Adding one
is a folder away, as described in the `Resource catalog` section.

## Installation behavior

Each run:

1. Shows the bundled resources in a checkbox menu.
2. Plans every filesystem operation without writing anything.
3. Shows one grouped review of creates, prepends, unchanged files, and
   conflicts.
4. Asks for one confirmation.
5. Applies the approved plan and summarizes the result.

The review marks every replacement of an unmanaged file as a conflict, and
the CLI warns before the single confirmation. Nothing gets replaced silently.
Malformed managed markers block installation instead of guessing how to edit
the file.

The `AGENTS.md` template uses stable managed markers. The first run creates
the full guide when `AGENTS.md` is absent and prepends only a small zrub
block when one already exists. Later runs recognize the markers and preserve
everything inside them byte-for-byte, including project notes and findings
written by agents. The CLI reviews every write before asking for approval.
Cancelling or picking nothing changes nothing.

## Tracking, updates, and removal

Installation records each approved mapping in project-root `zrub-lock.json`.
Commit this file alongside your installed guides. It stores relative paths,
exact-byte content hashes, the selected template source, and the Zrub package
version that supplied each file. Existing matching files can be adopted through
a reviewed tracking-only change. Existing managed blocks have unknown original
source provenance when no earlier manifest exists.

Run these commands from the target project's root:

```sh
pnpm dlx @zheckan/zrub@latest status
pnpm dlx @zheckan/zrub@latest status --json
pnpm dlx @zheckan/zrub@latest update
pnpm dlx @zheckan/zrub@latest update general-project-guidelines
pnpm dlx @zheckan/zrub@latest remove general-project-guidelines
```

`status` reports local edits, missing files, and bundled source changes without
writing anything. It compares against the running CLI's bundled catalog and
does not check npm for a newer release. A newer CLI with identical resource
contents causes no file or manifest rewrite. `list` and `read` still discover
and print resources without consulting or creating project tracking.

`update` selects all tracked resources, or only the IDs supplied. Local edits
stay intact by default; select individual edited files to replace before the
single final review and confirmation. Recognized managed blocks stay intact,
including when their bundled source changes. Review those changes manually
with `read <resource-id>`. Changed destinations or installation policies block
automatic migration rather than moving or replacing tracked content.

`remove` requires explicit resource IDs. It deletes only unchanged standalone
files written by Zrub. Modified files, adopted existing files, and managed
blocks are retained; you can explicitly forget their tracking while preserving
their contents. Directories stay in place. An empty manifest remains after the
last tracked mapping is removed.

Writes recheck reviewed contents and checkpoint tracking after each completed
mapping. If a later operation fails, earlier changes and checkpoints remain.
The CLI reports payload changes that succeeded without their checkpoint; inspect
`status` and review a retry. This is not a transaction across files or an exact
restoration mechanism. Preserve the reported changes when recovering from a
failed run.

An exclusive `.zrub-mutation.lock` prevents concurrent Zrub mutations. An
interrupted process can leave the lock behind. Verify that no Zrub process is
running before removing that specific lock and retrying. Files changed by an
unrelated editor after the final precondition check remain a filesystem race.

## Resource catalog

Publishable resources live in `resources/`. A resource is a self-contained
folder with `resource.json` metadata and one or more payload files. To add
one:

1. Create `resources/<resource-id>/`.
2. Add a `resource.json` with schema version `1`, a unique ID, name,
   description, kind, and at least one file mapping.
3. Put every referenced payload inside the same resource directory.
4. Choose an exact file destination or a directory destination ending in `/`.
5. Run the verification commands below. The catalog tests reject invalid
   metadata, duplicate IDs, missing payloads, and payload paths that escape
   the resource.

Documentation about developing this repository belongs in `docs/`, not in the
publishable catalog.

The package version identifies a bundled catalog release; `schemaVersion`
identifies the metadata format. Resources have no separate version field;
`zrub-lock.json` tracks installed content and package provenance per mapping.
The agent template variants and CI layouts are choices within resources, not
separately versioned releases.

## Development

Use pnpm 11.15.1 exclusively:

```sh
pnpm install
pnpm verify
pnpm fix
pnpm package:check
pnpm smoke:launchers
```

`pnpm verify` runs `format:check`, `typecheck`, `test`, and `build`. `pnpm
fix` formats the repository first and then verifies everything.

`pnpm package:check` builds a real npm tarball and validates its allowlisted
contents, then checks discovery and read-once access from the extracted package.
`pnpm smoke:launchers` packs the CLI and runs it through npx, pnpm
dlx, the repository-pinned Yarn 4.17.1, and bunx 1.3.14. Those launchers
resolve their dependencies from the registries, so the smoke needs network
access.

Publishing happens from CI. A push to `main` with a new package version
publishes to npm; pull requests only dry-run the publish.
