# Findings

This document records what agents and humans learn while working in this
repository: concise, verified, project-wide surprises, recurring sources of
confusion, and non-obvious constraints. `AGENTS.md` links here; record new
findings in the ledger below.

## How to record

- Verify before recording: run the command or read the file that proves it.
- Record outcomes and durable facts, not the steps taken to discover them.
  This document is not a work log.
- Never record secrets or credentials.
- Correct or remove a finding as soon as it stops being true. A stale finding
  is worse than a missing one.
- Keep each finding short enough that the next reader can act on it without
  asking how.

## FINDINGS

- Catalog containment must check physical paths as well as lexical paths. A
  nested directory symlink can point a regular payload file outside its
  resource root; symlinked metadata must also be rejected before reading it.
- Read-once CLI commands include `existingSource` payloads so agents receive
  both agent-template variants. They do not choose a variant based on the
  target project's files.
- The root `AGENTS.md` guides contributors who add resources to Zrub.
  `resources/agents-project-guide/zrub.md` is a payload delivered to other
  projects and holds their installation maintenance instructions.
- Clack's multiselect treats carriage return (`\r`) as the Enter key in piped
  launcher smoke tests; a newline (`\n`) leaves the top-level prompt unsettled.
- To smoke-test an npm tarball, npx must receive it through `--package`
  followed by the bin name. Passing the tarball as npx's positional command
  attempts to execute the archive itself.
- The ruleset REST schema requires `require_code_owner_review` and
  `require_last_push_approval` inside the `pull_request` parameters; the first
  version of the setup-profile runbook omitted both and its example failed
  with 422 (`/rules/3: data matches no possible input`).
- `schemaVersion` versions resource metadata, not guide content. The package
  version identifies the bundled catalog; individual resources have no version
  field. `zrub-lock.json` records content hashes and package provenance per
  installed mapping, including mixed versions after a partial update.
- Full and minimal `AGENTS.md` templates are selected only on first
  installation. Reinstallation preserves the managed block byte-for-byte, so
  new guide links in a bundled template do not reach existing managed blocks.
- `agents-project-guide` installs `docs/findings.md` as a standalone file,
  without the managed-block policy used for `AGENTS.md`. Findings edits therefore
  produce ordinary replacement conflicts when the resource is reinstalled.
- Adopted existing files have `observed-existing` provenance and are preserved
  by removal even when their contents match the recorded baseline. Only
  unchanged standalone files with `written` provenance are eligible for deletion.
- Manifest checkpoints follow payload writes. A failed checkpoint can leave an
  untracked created file or an outdated baseline; retries review adoption rather
  than assuming ownership. Earlier completed checkpoints survive later failures.
- The pinned pnpm 11.15.1 rewrites the whole `pnpm-lock.yaml` into compact YAML
  flow style whenever the lockfile changes, so `pnpm add`/`pnpm update` produce
  a full-file reformat. To keep lockfile diffs minimal (as in the security
  bumps), hand-edit only the affected entries in the existing style and verify
  semantic equality against a pnpm-regenerated copy before committing.
