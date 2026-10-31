# GitHub Repository Setup Profile

Use this runbook to apply this project's GitHub settings, branch protection,
release-tag protection, and shared labels. For a new repository, follow the
steps in order. For a label-only update, follow step 5 and the label
verification in step 6. Keep other settings unchanged. Apply the safety rules
to either path.

This is a one-off setup runbook. Read and follow it from its source without
copying the document into the target project. It changes remote configuration
only. A reader that only needs the result can stop after the verification step.

## Safety rules for the agent

1. Read the current state first and show the complete plan before any write:
   the repository-settings diff, the rulesets to create or update, and the
   label source with every label to create, update, rename, or delete.
2. Check for existing rulesets with the same name. Update them instead of
   creating duplicates, and never delete a ruleset that is not part of this
   profile.
3. Require one explicit confirmation before the first API write.
4. Read back every change after applying it and report the verified result.
   If one step fails, continue with the remaining steps and report the partial
   result. Do not attempt an automatic rollback.
5. Leave settings that are unavailable through the public API unchanged and
   list them as manual steps.

## Prerequisites

```sh
gh auth status
gh api user --jq .login
gh repo view --json nameWithOwner,defaultBranchRef,isTemplate \
  --jq '.nameWithOwner + " " + .defaultBranchRef.name + " template=" + (.isTemplate|tostring)'
```

For the full setup, the authenticated account must have repository
administration access. A label-only update requires write access. Replace
`{owner}` and `{repo}` with the values from `nameWithOwner`, and `{branch}`
with the default branch.

## 1. General repository settings

Apply the standard preset with a single patch:

```sh
gh api --method PATCH repos/{owner}/{repo} --input - <<'EOF'
{
  "is_template": false,
  "has_issues": true,
  "has_projects": true,
  "has_wiki": false,
  "has_discussions": false,
  "allow_squash_merge": true,
  "allow_merge_commit": false,
  "allow_rebase_merge": false,
  "allow_auto_merge": true,
  "allow_update_branch": false,
  "delete_branch_on_merge": true,
  "web_commit_signoff_required": false
}
EOF
```

Notes:

- Squash commit messages keep GitHub's defaults; do not set
  `squash_merge_commit_title` or `squash_merge_commit_message`.
- Do not change `private` or `visibility`; the public or private choice is a
  separate decision made per repository.

## 2. Derive required status-check names

When creating or restructuring TypeScript CI, first follow the
[TypeScript CI setup guide](https://github.com/Zheckan/zrub/blob/main/resources/typescript-ci-setup/typescript-ci-setup.md).
Confirm whether the user prefers separate check results or lower runner usage.
Its two layouts produce different required check names.

Required status checks must match workflow check names exactly. List the check
names the latest commit produced:

```sh
gh api repos/{owner}/{repo}/commits/{branch}/check-runs \
  --jq '[.check_runs[].name] | unique'
```

Rules:

- Expand matrix jobs into their concrete names, for example `Node 22`,
  `Node 24`, and a dedicated smoke job.
- If the repository has no CI runs yet, omit the `required_status_checks`
  rule in step 3 and add it after the first workflow run. Requiring unknown
  check names blocks merges.
- If the workflows use matrix jobs, prefer renaming to stable, unique job
  names, or the required contexts must list every matrix combination.

## 3. Branch ruleset `main-protection`

Check whether the ruleset already exists:

```sh
gh api repos/{owner}/{repo}/rulesets \
  --jq '.[] | select(.name == "main-protection") | .id'
```

Create it with `POST` or update the existing id with
`PUT repos/{owner}/{repo}/rulesets/{ruleset_id}`:

```sh
gh api --method POST repos/{owner}/{repo}/rulesets --input - <<'EOF'
{
  "name": "main-protection",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [
    { "actor_id": 2, "actor_type": "RepositoryRole", "bypass_mode": "always" },
    { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }
  ],
  "conditions": {
    "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_linear_history" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true,
        "allowed_merge_methods": ["squash"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [
          { "context": "Node 22" },
          { "context": "Node 24" }
        ]
      }
    },
    { "type": "copilot_code_review" }
  ]
}
EOF
```

Notes:

- `required_approving_review_count` stays `0` for a single-maintainer
  repository; the pull-request rule is what prevents direct pushes.
- The bypass actors are repository roles `2` (Triage) and `5` (Admin) with
  `always` bypass, so the owner can still push when automation is blocked.
- Replace the status-check contexts with the names derived in step 2. Omit
  the whole `required_status_checks` rule when no checks exist yet.
- Omit `copilot_code_review` when the account has no Copilot code review
  access.

## 4. Release-tag ruleset `release-tags`

Protect the `v*` tags used by npm releases:

```sh
gh api --method POST repos/{owner}/{repo}/rulesets --input - <<'EOF'
{
  "name": "release-tags",
  "target": "tag",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": {
    "ref_name": { "include": ["refs/tags/v*"], "exclude": [] }
  },
  "rules": [{ "type": "deletion" }, { "type": "non_fast_forward" }]
}
EOF
```

Apply the same existing-name check as in step 3.

## 5. Copy shared labels

Use `Cenoir-Studios/.github` as this profile's label source. If the user names
another source repository, use that repository instead.

The source holds 32 labels. The table lists them so a reader can tell what each
label is for. Copy names, colors, and descriptions from the source, not from
this table. If the two differ, the source is correct and this table needs an
update.

| Group             | Labels                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Type              | `bug`, `enhancement`, `idea`, `documentation`, `performance`, `security`, `research`, `tech debt`, `epic`                               |
| Planning          | `now`, `next`, `later`, `someday`                                                                                                       |
| Triage            | `needs-triage`, `needs discussion`, `needs more info`, `accepted`, `already implemented`, `duplicate`, `wontfix`, `upstream`, `blocked` |
| Pull requests     | `WIP`, `DO NOT MERGE`, `breaking`, `dependencies`                                                                                       |
| Pull-request size | `size:XS`, `size:S`, `size:M`, `size:L`, `size:XL`, `size:XXL`                                                                          |

The planning labels say when work happens, and they replace priority labels.
Give an item at most one of them: `now` drops other work, `next` belongs to the
next version, `later` is wanted but not for the next version, and `someday`
has no plan. `wontfix` stays the label for work that will not happen.

Read both label sets:

```sh
label_source='Cenoir-Studios/.github'
label_target='{owner}/{repo}'
gh label list --repo "$label_source" --limit 200 \
	--json name,color,description --jq 'sort_by(.name)'
gh label list --repo "$label_target" --limit 200 \
	--json id,name,color,description --jq 'sort_by(.name)'
```

`gh api --paginate` does not accept `--slurp` together with `--jq`, so the
commands use `gh label list`. Raise `--limit` if a repository has more than
200 labels.

Match the target label set to the source exactly. Compare names without regard
to case when identifying existing labels. List missing labels to create,
colors or descriptions to update, case-only renames, and target-only labels
to delete. Include the source repository and the complete label diff in the
plan required by the safety rules.

Deleting a label also removes its issue and pull-request assignments. Inspect
those assignments for every planned deletion and include affected items in
the plan.

If the reviewed label sets change before the copy, refresh the plan before
applying it. After confirmation, copy the labels:

```sh
gh label clone "$label_source" --repo "$label_target" --force
```

`--force` updates matching labels to the source colors and descriptions. The
copy command leaves target-only labels in place. After the copy succeeds,
apply any planned case-only renames with `gh label edit --name`. Then delete
each target-only label listed in the confirmed plan:

```sh
label_name='label from the confirmed deletion list'
label_path=$(jq -rn --arg name "$label_name" '$name | @uri')
gh api --method DELETE "repos/$label_target/labels/$label_path"
```

Encode the label name as shown so spaces and other URL characters remain part
of the label name. See the [GitHub CLI label-copy reference](https://cli.github.com/manual/gh_label_clone)
and the [GitHub label API](https://docs.github.com/en/rest/issues/labels#delete-a-label).

Repeat this step when you want to copy later source changes. Personal accounts
have no shared label inheritance. Organization defaults apply only to new
repositories and do not update existing repositories. See
[organization default labels](https://docs.github.com/en/organizations/managing-organization-settings/managing-default-labels-for-repositories-in-your-organization).

## 6. Verify and report

Read back the applied state:

```sh
gh api repos/{owner}/{repo} \
  --jq '{squash: .allow_squash_merge, merge: .allow_merge_commit, rebase: .allow_rebase_merge, auto_merge: .allow_auto_merge, delete_branch: .delete_branch_on_merge, wiki: .has_wiki, discussions: .has_discussions}'
gh api repos/{owner}/{repo}/rulesets --jq '.[] | {name, enforcement, target}'
gh api repos/{owner}/{repo}/rules/branches/{branch} \
  --jq '.[] | {rule: .type, parameters: .parameters}'
gh label list --repo {owner}/{repo} --limit 200 \
	--json id,name,color,description --jq 'sort_by(.name)'
```

Report one table with the repository settings, each ruleset with its
enforcement state, and the effective rules on the default branch. Confirm that
no duplicate rulesets were created and state which steps, if any, remain
manual.

Verify that the source and target have the same label names, colors, and
descriptions, with no extra or missing labels. Ignore case only when comparing
hexadecimal colors. Check that each retained label keeps its ID. Report the
source repository, labels created, updated, renamed, or deleted, affected
assignments, and any failures.

For a label-only update, read back only the labels and report their results.

## 7. Settings without a public API (manual)

These stay unchanged and require the repository settings page:

- Disable release immutability and Sponsorships.
- Allow comments on individual commits.
- Do not enable the preview limit for branches and tags updated in one push.
- Automatically close issues linked to merged pull requests.
- Do not include Git LFS objects in source archives.

## 8. Out of scope

- Automated application of this profile through the CLI, including staged
  remote actions and a dedicated confirmation flow: deferred. See
  `docs/future-ideas.md` in the zrub repository for the designed stages.
- npm provenance: requires publishing from CI with OIDC on a public
  repository.
