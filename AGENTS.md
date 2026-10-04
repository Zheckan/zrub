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

## FINDINGS

Findings live in [docs/findings.md](docs/findings.md). Read it before
starting and record new findings there.
