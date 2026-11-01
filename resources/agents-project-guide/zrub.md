# zrub maintenance

`zrub` installed this project's agent guides. This file is the agent's
self-service manual for maintaining the guides installed in this project.

## What zrub installed

- The managed section at the top of `AGENTS.md`, between the
  `<!-- zrub:agents-project-guide:start -->` and `:end -->` markers.
- `docs/findings.md`, the findings ledger.
- The guides under `docs/project-guides/`, including this file.
- `zrub-lock.json`, tracking installed destinations, hashes, and source
  provenance. Commit it alongside the installed guides.

## Tasks

- Discover instructions for a one-time task: run `npx @zheckan/zrub@latest list`.
  Receive a resource with `npx @zheckan/zrub@latest read <resource-id>` and
  follow its instructions for the requested task. Add `--json` for structured
  output. These commands leave the target project unchanged; the agent
  performs the described work.
- Reinstall or add guides: run `npx @zheckan/zrub@latest`. The managed
  `AGENTS.md` section is preserved byte-for-byte; every other write is shown
  for review first.
- Inspect tracking and local edits: run `npx @zheckan/zrub@latest status`, or
  add `--json`. This reads the current bundled catalog without fetching newer
  releases and leaves the project unchanged.
- Update tracked guides: run `npx @zheckan/zrub@latest update [resource-id...]`.
  Omit IDs to review all tracked resources. Edited standalone files are
  preserved by default; select each replacement explicitly before the final
  confirmation. Managed blocks remain intact. Review changed block sources
  manually with `read agents-project-guide`.
- Remove a tracked resource: run `npx @zheckan/zrub@latest remove <resource-id>`.
  Only unchanged Zrub-written standalone files are deleted. Edited files,
  adopted files, and managed blocks are retained; forgetting their tracking
  requires an explicit selection and preserves their contents.
- Re-apply the GitHub repository standard (settings, the `main-protection`
  branch ruleset, shared labels): read and follow the one-off
  runbook with `npx @zheckan/zrub@latest read github-repo-setup-profile` without
  copying it into the project. Source:
  https://github.com/Zheckan/zrub/blob/main/resources/github-repo-setup-profile/github-repo-setup-profile.md
- Create or restructure TypeScript CI: follow the separate CI guide to create
  or update the project's workflow file. Receive it with
  `npx @zheckan/zrub@latest read typescript-ci-setup`. Source:
  https://github.com/Zheckan/zrub/blob/main/resources/typescript-ci-setup/typescript-ci-setup.md
- Record findings in `docs/findings.md`.

## Rules

- Keep the marker lines in `AGENTS.md` intact; everything between them is
  editable.
- Keep `zrub-lock.json` intact. Ordinary reinstallation preserves known
  baselines; read-only commands never adopt local edits. Manifest-only baseline
  changes are reviewed before application.
- When manually removing the managed section, remove both marker lines with
  it. Zrub removal preserves this editable shared content.
- Inspect status after a partial failure. Payload changes can succeed before
  tracking is checkpointed; a retry must be reviewed and may adopt matching
  contents without assuming Zrub originally created them.
- An interrupted mutation may leave `.zrub-mutation.lock`. Verify no Zrub
  process is running before removing that specific lock. Never clear a lock
  solely because it is old.
- Never record secrets in findings or guides.
