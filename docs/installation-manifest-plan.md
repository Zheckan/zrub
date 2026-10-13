# Installation manifest development plan

Status: implemented after design acceptance on 2026-10-12. This document records
the feature's scope, contracts, and implementation sequence. See README for usage.

## Outcome and scope

Projects can see which Zrub resources they installed, identify local edits, and
review updates and removals without losing project knowledge. Record this in a
project-root `zrub-lock.json`, committed alongside the installed files.

Ship in three stages: installation tracking and status; explicit updates;
conservative removal. The first stage is independently useful and must ship
before the later commands. Compare against the catalog bundled with the running
CLI. A newer CLI supplies newer resources; commands do not fetch upstream data.

Exact restoration, automatic merging of editable blocks, global skills, external
skill repositories, and automatic repository setup remain separate features.
Do not reuse `skills-lock.json`: its schema belongs to another installer and
does not describe Zrub's file mappings and editable managed blocks.

## Current implementation anchors

Read these files before implementing the corresponding stage:

- `src/installer/plan-installation.ts` resolves destinations and classifies
  creates, prepends, unchanged files, and conflicts without writing.
- `src/installer/apply-plan.ts` writes atomically per file and reports partial
  success. It does not provide a transaction across files.
- `src/installer/managed-block.ts` identifies the editable managed region.
- `src/installer/destination.ts` checks containment and rejects symbolic links.
- `src/cli/commands.ts` dispatches commands; `run-cli.ts` coordinates prompts.
- `tests/installer/` verifies filesystem behavior; `tests/cli/commands.test.ts`
  exercises the compiled public CLI in temporary projects.
- `docs/read-once-design.md` defines the existing `list` and `read` contracts.
- `docs/future-ideas.md` defines preservation rules for existing agent blocks.

The package version identifies a bundled catalog release. Resource metadata's
`schemaVersion` identifies its format, not its content revision. The agent guide
also installs `docs/findings.md` as an editable standalone file; protecting only
the `AGENTS.md` managed block would be insufficient.

## Public behavior

| Command                            | Result                                                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `zrub`                             | Existing interactive selection and review, now including manifest changes.                                      |
| `zrub status [--json]`             | Read-only report of tracked resources and destinations against local contents and the bundled catalog.          |
| `zrub update [resource-id...]`     | Review selected tracked resources against the running CLI's catalog; omitted IDs select all tracked resources.  |
| `zrub remove <resource-id...>`     | Review removal of explicitly selected tracked resources. Require IDs to avoid accidental removal of everything. |
| `zrub list [--json]`               | Existing catalog discovery, unchanged.                                                                          |
| `zrub read <resource-id> [--json]` | Existing complete resource output, unchanged.                                                                   |

Each mutating command shows one complete review and asks for one confirmation.
Empty selection, cancellation, and declined confirmation leave the target
unchanged, including the manifest. Phase one adds only `status`; later stages
add their commands. Machine-readable mutation and confirmation-bypass flags are
outside this initial design.

`status` exits successfully when inspection succeeds, even when edits or updates
exist. Invalid metadata, inaccessible files, malformed manifests, unsupported
manifest versions, and invalid arguments exit nonzero. JSON emits one complete,
stable result to stdout with errors on stderr and no prompts or ANSI codes.
An absent manifest reports no tracked installations and creates nothing.

## Manifest contract

Use `schemaVersion: 1` and a map keyed by resource ID. Keep entries sorted by ID
and destination for stable Git diffs. Avoid timestamps, absolute paths, and
machine-specific state. Record provenance per mapping because a partial update
can leave a resource's files originating from different package releases.

Each mapping with known source provenance records:

- Project-relative destination and resource-relative source filename.
- The actual selected source, including `AGENTS.md` versus
  `AGENTS.existing.md`; never infer the variant from today's target file.
- Package name and version that provided this mapping's installed baseline.
- A discriminated ownership mode: `file` or `managed-block`.
- A discriminated provenance mode: `written` or `observed-existing`.
- SHA-256 of the actual installed baseline bytes. For managed blocks, hash
  only the region from the start marker through the end marker, inclusive.
- SHA-256 of the selected source payload to compare bundled content changes
  independently of generated markers and project content.

Represent source provenance as a `known` or `unknown` variant. The unknown
variant still records the destination, ownership, adoption mode, and observed
baseline hash, but omits unverifiable package, source, and variant claims.

Package provenance is recorded by the executing distribution, never read from
the target project's `package.json`. The schema version and package version
remain independent. No resource metadata change is needed for this feature.

Hash exact bytes without newline or whitespace normalization. Marker parsing
must preserve all surrounding bytes, including CRLF and Unicode. Managed-block
hashes describe a baseline; they never grant permission to replace an editable
block. `observed-existing` records a reviewed adoption, not proof that Zrub
created the existing file.

Parse the manifest as untrusted data. Validate IDs, variants, hashes, versions,
ownership modes, and all relative paths. Reject duplicate ownership of a file,
duplicate ownership of the same block, unsafe paths, symlinks, and mappings that
overlap a whole-file owner with a block owner. Reserve `zrub-lock.json` and the
`.zrub-mutation.lock` so catalog payloads cannot overwrite installer bookkeeping.
Other resources' distinct blocks may coexist in one shared file.

Malformed or newer manifests fail closed without overwriting the file. Preserve
entries absent from the current catalog: report them as unavailable, and permit
safe removal using their validated recorded destinations. Reading the catalog
through `list` or `read` does not require a healthy project manifest.

## Classification and compatibility

Track local state and bundled-source state separately rather than combining all
differences into one status. Local states include unchanged, modified, missing,
unverified ownership, and malformed block. Catalog states include unchanged,
changed, unknown-baseline, and unavailable. A newer package with identical payloads is not a
content update. Show installed package provenance without claiming the running
CLI has checked the latest published release.

For standalone tracked files, compare current bytes with the recorded baseline
and the proposed payload:

| Condition                                        | Update behavior                                            |
| ------------------------------------------------ | ---------------------------------------------------------- |
| Current equals baseline; bundled payload differs | Review an ordinary update.                                 |
| Current equals baseline; bundled payload matches | Preserve file and baseline; no write.                      |
| Current differs from baseline                    | Show a local-edit conflict, even if upstream also changed. |
| File is missing                                  | Review recreation using the bundled payload.               |
| Resource is unavailable                          | Report it; preserve its records and contents.              |

If current bytes already equal the proposed payload but differ from the
baseline, review an explicit tracking-only baseline change. A read-only command
or ordinary no-op must never silently relabel local edits as an installed
revision. Show both source changes and local-edit state in the review; replacement
of an edited standalone file requires an explicit per-file choice before the
single final confirmation. Default to preserving the edited file.

For existing projects without tracking:

- Newly written files receive known baselines after successful writes.
- An existing standalone file equal to the payload may be tracked as
  `observed-existing` through a reviewed manifest-only operation.
- A recognized managed block remains byte-for-byte unchanged. Its current hash
  can be observed, but original package provenance and template variant remain
  explicitly unknown unless supported by evidence.
- A differing unmanaged file retains the existing reviewed replacement-conflict
  behavior. Track the new baseline only if replacement succeeds.

Model unknown provenance explicitly, rather than inventing a package version,
variant, or original source hash. In particular, an already customized managed
block cannot truthfully be attributed to the current CLI release.

## Editable blocks and removal

Ordinary installation always preserves recognized managed blocks. The initial
`update` command also preserves them, reports available bundled changes, and
directs the user to review those changes manually. Automatic merging and the
explicit block-update flow from `docs/future-ideas.md` need a separate design.

The initial removal command deletes only standalone files with `written`
provenance whose current bytes still match the recorded baseline. Modified
files, observed-existing files, and all managed blocks are retained. The review
lets the user either keep tracking a retained mapping or forget it while
preserving its contents; forgetting requires an explicit selection. Missing
files can have their records removed after review.

For a multi-file resource, report each deleted, missing, retained, or forgotten
mapping. Keep the resource entry until its last mapping is removed. Never delete
shared `AGENTS.md`, remove a whole directory, or infer ownership from a filename.
Keep an empty valid manifest after removing the last entry, so removal does not
silently change the project's manifest policy.

## Module responsibilities and execution safety

Keep the installer planner as the deep module. Extend its input with validated
installation state and an operation intent. It returns reviewable file and
tracking operations with expected preconditions; command dispatch and prompts
do not classify filesystem states.

Add focused internal modules under `src/installer/` for manifest parsing and
serialization, hashing, and status inspection. Reuse containment and atomic-write
code. Extend operation and result types with discriminated variants, including
tracking-only changes and file deletion, instead of optional-field bags.

Before applying, revalidate the manifest snapshot and every affected destination
against the reviewed state. Recheck each affected file before its write or
deletion; stop if it changed during review. Acquire an exclusive, project-local
mutation lock after confirmation and before writes so concurrent Zrub commands
cannot update the manifest independently. Status remains read-only. An orphaned
lock produces a clear diagnostic for manual recovery; do not automatically
break a lock based only on age. Remove only the lock acquired by this execution.
Document the remaining race with unrelated editors after a precondition check;
do not claim OS-level filesystem transactions.

Checkpoint the manifest after each successfully applied mapping or tracking-only
operation. Record only actual completed outcomes, and stop immediately if a
checkpoint fails. A deletion removes its record only after deletion succeeds.
Keep unrelated entries unchanged and avoid serializing an unchanged manifest.

There is a crash window between a payload change and its manifest checkpoint.
Handle it conservatively: an existing old baseline will report the changed file
as modified or missing; an unrecorded created file remains unverified ownership.
Never adopt either automatically or claim multi-file atomicity. Report a failed
checkpoint separately from a failed payload operation and list payload changes
that succeeded without tracking. A reviewed retry can adopt exact matching
standalone contents as observed-existing; stronger recovery needs a later design.

## Implementation stages

### 1. Tracking and read-only status

1. Add manifest and hash modules with real temporary-project tests for parsing,
   deterministic serialization, unknown provenance, and containment attacks.
2. Extend installation planning to include manifest changes and adoption while
   preserving the current file-operation behavior and managed blocks.
3. Extend execution with preconditions, mutation exclusion, manifest checkpoints,
   and precise partial-failure reporting.
4. Add `status` dispatch and plain/JSON formatting. Snapshot the target before
   and after status, list, and read to prove they write nothing.
5. Test first installation, repeat installation, adoption, edited blocks,
   malformed manifests, unavailable catalog entries, and mixed-version files.

Completion: new installations have accurate per-mapping records; existing
projects preserve their contents; status distinguishes local edits from bundled
source changes; failed or cancelled runs never claim unperformed installations.

### 2. Explicit updates

1. Add update intent to the planner using the state comparison above.
2. Add tracked-resource selection, per-file conflict choices, and one combined
   file/manifest review. Validate every requested ID before any mutation.
3. Preserve managed blocks and explicitly report their skipped source updates.
4. Treat changed destinations, changed installation policies, and removed
   mappings as migration conflicts. Preserve old mappings until a dedicated
   migration is designed; do not silently move, delete, or repurpose files.
5. Use two local catalog fixtures representing different package releases to
   prove clean updates, combined local/upstream edits, missing-file recreation,
   unchanged-content releases, cancellation, and partial failures.

Completion: updates use the running bundled catalog, update only approved
mappings, preserve skipped baselines, and retain all editable managed content.

### 3. Conservative removal

1. Add deletion and forgetting operations using recorded ownership and baseline
   checks, including entries unavailable in the current catalog.
2. Add explicit resource selection and per-mapping retention/forgetting choices.
3. Revalidate ownership and current bytes before deleting each eligible file.
4. Test modified files, observed-existing files, shared blocks, missing files,
   multi-file resources, cancellation, unsafe paths, and failed deletions.

Completion: clean Zrub-written standalone files can be removed after review;
edited and shared content stays intact; manifest entries reflect only completed
removals and explicit forgetting.

## Documentation, packaging, and acceptance

At each shipped stage, update README command help and the delivered
`resources/agents-project-guide/zrub.md` maintenance instructions. Update future
ideas to distinguish implemented tracking from deferred restoration, block
updates, and global skills. Keep the existing catalog metadata schema and
resource count unchanged. Add verified implementation findings to the ledger.

Use behavior-first tests at the planner/executor interface and compiled CLI,
with temporary files and failure injection at the existing writer seam. Extend
package verification to exercise shipped status and confirm installed tracking
works outside this checkout without importing development files.

For each implementation stage and for this plan's repository checks, run:

```sh
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

For implementation stages, also run `pnpm package:check`. Repeat launcher smoke
tests when prompt or launch behavior changes. Publishing and remote changes
remain separate authorized actions.

The complete feature is accepted when all three stages pass their completion
criteria, the packed CLI behaves the same outside the checkout, and cancellation,
local edits, unsafe manifests, stale plans, concurrent mutations, and partial
failures have executable coverage.
