# Zrub

This repository builds the `zrub` npm CLI. Publishable resources
live in `resources/`; documentation about developing this repository lives in
`docs/`. Runtime code lives in `src/`, and behavior is verified through
`tests/`.

## Working in this repository

- Use pnpm only. Do not create npm, Yarn, or Bun lockfiles.
- Keep the CLI orchestration thin; filesystem decisions belong in the installer
  planner.
- Treat resource metadata as untrusted input and keep every resolved path
  inside its declared root.
- Preserve editable managed blocks byte-for-byte after their first
  installation.
- Before claiming success, run `pnpm format:check`, `pnpm typecheck`,
  `pnpm test`, and `pnpm build`.

## Adding instructions and resources

When the user asks to "add instructions for X", choose the resource by its
intended result. Use these distinctions and ask only when the intended result
is ambiguous:

| Intended result                         | Resource form                                                                                      | Example                                                                                                          |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Perform a setup task once               | A standalone runbook, read and followed from its source without copying it into the target project | `resources/github-repo-setup-profile/github-repo-setup-profile.md` changes GitHub settings.                      |
| Create or maintain a project file       | A dedicated guide with templates or examples for that file                                         | `resources/typescript-ci-setup/typescript-ci-setup.md` produces the target project's `.github/workflows/ci.yml`. |
| Consult conventions during ongoing work | A reusable guide with a conditional link from the project's agent instructions                     | `resources/frontend-project-structure/frontend-project-structure.md`.                                            |
| Give an agent project-specific context  | An editable agent instructions template                                                            | `resources/agents-project-guide/AGENTS.md`.                                                                      |
| Reuse an agent workflow across projects | An agent skill with `SKILL.md` and any supporting files                                            | Global skill distribution is planned in `docs/future-ideas.md`.                                                  |

- Keep each topic in its own resource. CI setup and GitHub repository settings
  have separate guides; link between them only where their tasks intersect.
- Keep reusable payloads in `resources/<resource-id>/`. Keep Zrub contributor
  instructions in this root `AGENTS.md` and development documents in `docs/`.
  `resources/agents-project-guide/zrub.md` is the maintenance manual delivered
  to other projects.
- Separate content type from how a reader uses it. The current catalog kinds
  are `guide`, `prompt`, `template`, `example`, and `code`. A one-off runbook
  can be a `guide`; its purpose does not imply installation into a project.
- Every resource must be discoverable and readable without installation.
  This applies to GitHub setup, CI setup, project conventions, and future
  resources. An agent may read a guide and perform its task without saving
  the guide or changing `AGENTS.md`; creating the requested workflow or
  changing repository settings is separate from installing instructions.
- When adding conventions for ongoing work, include a conditional pointer in
  the full and minimal agent templates that says when to consult the guide.
  Use a local path when installed and a source link or `read <resource-id>`
  command when it is not. Match the guide to the project: general project
  guidelines apply to CLIs and other projects; the frontend guide applies
  where its UI conventions fit. Preserve existing managed blocks; read the
  conditional-link plan in `docs/future-ideas.md` before changing installation
  or update behavior.
- The CLI installs file mappings or returns resources through `list` and
  `read <resource-id>`, with optional `--json` output. Reading must leave the
  target project unchanged and preserve complete source contents. Read
  `docs/read-once-design.md` when changing these commands.
- Global agent skill support is future work. Read `docs/future-ideas.md` and
  design that flow before changing metadata or the installer.
- When adding a catalog resource, include its metadata and payloads, update
  the README, catalog expectations, and package-content checks, and run
  `pnpm package:check` in addition to the required verification commands.

## FINDINGS

Findings live in [docs/findings.md](docs/findings.md). Read it before
starting and record new findings there.
