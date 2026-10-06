# zrub project guides

`zrub` installed this project's agent guides. This file is the agent's
self-service manual for organizing project instructions, selecting guides, and
maintaining the installation.

## What zrub installed

- The managed section at the top of `AGENTS.md`, between the
  `<!-- zrub:agents-project-guide:start -->` and `:end -->` markers.
- `docs/findings.md`, the findings ledger.
- The guides under `docs/project-guides/`, including this file.

## Instruction variants and document ownership

| Document                                            | Purpose                                                                            | When to read or edit it                                                                                                         |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                         | Project purpose, setup, conventions, verification, and pointers to detailed guides | Read before work. Fill in project-specific facts after inspecting the repository.                                               |
| `docs/findings.md`                                  | Verified project-wide surprises and constraints                                    | Read before work and record new findings after verification.                                                                    |
| `docs/project-guides/zrub.md`                       | This installation and document organization guide                                  | Read when adding, updating, or organizing guides.                                                                               |
| `docs/project-guides/github-repo-setup-profile.md`  | GitHub settings and protection runbook                                             | Read when configuring repository settings or required checks.                                                                   |
| `docs/project-guides/typescript-ci-setup.md`        | Separate and consolidated TypeScript CI layouts                                    | Read when creating CI or changing its job layout. Confirm the user's visibility versus runner-usage preference before choosing. |
| `docs/project-guides/frontend-project-structure.md` | React source organization                                                          | Read when organizing frontend code.                                                                                             |

Only selected resources are installed. If a referenced guide is absent, use
its source under [Zrub's resources](https://github.com/Zheckan/zrub/tree/main/resources)
or install it through the CLI. A link in `AGENTS.md` does not install a guide.

The agent project guide has two installation variants:

- When `AGENTS.md` is absent, Zrub installs the full template. Inspect the
  project and replace its comments with its purpose, important paths,
  prerequisites, setup and development commands, and verification commands.
- When `AGENTS.md` exists, Zrub prepends a minimal provenance section with
  guide links. Keep the existing project instructions as their source of
  truth, and add missing setup or convention details there.

Both variants use the same managed markers. After the first installation,
Zrub preserves the complete block byte-for-byte, including edits made by the
project's owner or agents. Reinstallation does not switch variants or refresh
the block's links. Review and edit those links by hand when adding a guide.

Keep instructions needed for every task in `AGENTS.md`. Put detailed recipes
in `docs/project-guides/` and link them with a trigger, for example, "When
creating or restructuring CI, read `docs/project-guides/typescript-ci-setup.md`
and confirm the desired layout." Keep project design decisions and execution
plans in the project's existing documentation folders, with links where needed.

## Versions and updates

Zrub's package version identifies the bundled catalog release. A resource's
`schemaVersion` identifies its metadata format, not a revision of its content.
Resources currently have no individual version field, installation manifest,
or automatic upgrade tracking. The full and minimal agent templates, and the
two CI layouts, are content variants rather than independently versioned
releases.

Before replacing an installed guide, compare it with the source in the chosen
Zrub release and preserve project-specific changes. The installer reports a
different standalone file as a replacement conflict. Its final confirmation
approves the reviewed writes; the managed `AGENTS.md` block remains unchanged.

## Tasks

- Reinstall, update, or add guides: run `npx @zheckan/zrub@latest`. The managed
  `AGENTS.md` section is preserved byte-for-byte; every other write is shown
  for review first.
- Re-apply the GitHub repository standard (settings, the `main-protection`
  branch ruleset, `release-tags` protection): follow
  `docs/project-guides/github-repo-setup-profile.md`. Source of truth:
  https://github.com/Zheckan/zrub/blob/main/resources/github-repo-setup-profile/github-repo-setup-profile.md
- Create or restructure TypeScript CI: follow
  `docs/project-guides/typescript-ci-setup.md`. Source of truth:
  https://github.com/Zheckan/zrub/blob/main/resources/typescript-ci-setup/typescript-ci-setup.md
- Record findings in `docs/findings.md`.

## Rules

- Keep the marker lines in `AGENTS.md` intact; everything between them is
  editable.
- There is no uninstall workflow yet. Removing installed files by hand is
  fine; when removing the managed section, remove both marker lines with it.
- Never record secrets in findings or guides.
