# Project Blueprints

This repository builds the `project-blueprints` npm CLI. Publishable resources
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

## Findings

Record concise, verified, project-wide surprises, recurring sources of
confusion, and non-obvious constraints here. Do not use this section as a work
log. Never record secrets. Correct or remove stale findings.

- Clack's multiselect treats carriage return (`\r`) as the Enter key in piped
  launcher smoke tests; a newline (`\n`) leaves the top-level prompt unsettled.
- To smoke-test an npm tarball, npx must receive it through `--package` followed
  by the bin name. Passing the tarball as npx's positional command attempts to
  execute the archive itself.
