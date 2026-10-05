# Zrub

`zrub` installs reusable engineering guides, prompts, templates, examples, and
code into new or existing projects. You pick resources in a checkbox menu,
review every planned file write, confirm once, and the CLI does the rest.

> **MVP.** This first release is the interactive installer with three bundled
> resources. Later releases add a persistent installation manifest, list and
> update and remove commands, and automated repository setup. The catalog
> will grow a lot.

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
- **Frontend project structure.**
  `docs/project-guides/frontend-project-structure.md` organizes a React
  codebase around thin pages, feature-owned product logic, reusable domain
  logic, and a shared UI layer.
- **GitHub repository setup profile.**
  `docs/project-guides/github-repo-setup-profile.md` is an agent runbook that
  applies this project's standard GitHub settings, the `main-protection`
  branch ruleset, and `release-tags` tag protection to a new repository. It
  changes remote configuration only and never writes files into the target
  repository.

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
contents. `pnpm smoke:launchers` packs the CLI and runs it through npx, pnpm
dlx, the repository-pinned Yarn 4.17.1, and bunx 1.3.14. Those launchers
resolve their dependencies from the registries, so the smoke needs network
access.

Publishing happens from CI. A push to `main` with a new package version
publishes to npm; pull requests only dry-run the publish.
