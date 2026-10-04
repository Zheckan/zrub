# Zrub

`zrub` is an interactive CLI for installing reusable engineering
guides, prompts, templates, examples, and code into new or existing projects.

> The package is under development and has not been published to npm yet.

After publication, run one of these commands from the target project's root:

```sh
npx zrub@latest
pnpm dlx zrub@latest
yarn dlx zrub@latest
bunx zrub@latest
```

Node.js 22 or newer is required. `yarn dlx` requires modern Yarn rather than
Yarn Classic 1.x. `bunx` invokes the package's Node shebang, so Node.js remains
required when launching through Bun.

## Included resources

- **Agent project guide** installs a managed, editable section at the top of
  `AGENTS.md` with a project overview, important conventions, and verification
  commands, plus `docs/findings.md`, the findings ledger with its recording
  guide. When `AGENTS.md` already exists, the CLI prepends only a small
  provenance block with the zrub links instead of the full template. The
  section links to the GitHub repository setup profile, so an agent in any
  project knows the standard `gh api` commands without reviewing other
  repositories. Existing content stays below the inserted section.
- **Frontend project structure** installs
  `docs/project-guides/frontend-project-structure.md`, a React guide organized
  around thin pages, feature-owned product logic, reusable domain logic, and a
  shared UI layer.
- **GitHub repository setup profile** installs
  `docs/project-guides/github-repo-setup-profile.md`, an agent runbook that
  applies this project's standard GitHub settings, the `main-protection` branch
  ruleset, and `release-tags` tag protection to a new repository.

The catalog can later include guides, prompts, templates, examples, and code.

## Installation behavior

The CLI will:

1. Show the bundled resources in a checkbox menu.
2. Plan every filesystem operation without writing anything.
3. Show one grouped review of creates, prepends, unchanged files, and conflicts.
4. Ask for one confirmation.
5. Apply the approved plan and summarize the result.

Existing unmanaged files are never replaced silently: the review marks each
replacement as a conflict and the CLI warns before the single confirmation.
Malformed managed markers block installation instead of guessing how to edit
the file.

The `AGENTS.md` template uses stable managed markers. The first run creates
the full guide when `AGENTS.md` is absent or prepends only a small provenance
block when it already exists; later runs recognize the markers and preserve
everything inside them byte-for-byte, including project notes and findings
written by agents. The CLI reviews every write before asking for approval,
and cancellation or an empty selection makes no changes.

## Resource catalog

Publishable resources live in `resources/`. A resource is a self-contained
folder with `resource.json` metadata and one or more payload files. To add one:

1. Create `resources/<resource-id>/`.
2. Add a `resource.json` with schema version `1`, a unique ID, name,
   description, kind, and at least one file mapping.
3. Put every referenced payload inside the same resource directory.
4. Choose an exact file destination or a directory destination ending in `/`.
5. Run the verification commands below. Catalog tests reject invalid metadata,
   duplicate IDs, missing payloads, and payload paths that escape the resource.

Documentation about developing this repository belongs in `docs/`, not in the
publishable catalog.

## Development

Use pnpm 11.15.1 exclusively:

```sh
pnpm install
pnpm verify
pnpm fix
pnpm package:check
pnpm smoke:launchers
```

`pnpm verify` runs `format:check`, `typecheck`, `test`, and `build`.
`pnpm fix` formats the repository first and then verifies it.

`pnpm package:check` builds a real npm tarball and validates its allowlisted
contents. `pnpm smoke:launchers` packs the CLI and runs it through npx, pnpm
dlx, the repository-pinned Yarn 4.17.1, and bunx 1.3.14. The launcher smoke
requires those package managers to resolve dependencies from their registries.

The package is not published as part of normal development or CI. A persistent
installation manifest and `list`, `update`, or `remove` workflows are deferred;
the first release provides the interactive installer only.
