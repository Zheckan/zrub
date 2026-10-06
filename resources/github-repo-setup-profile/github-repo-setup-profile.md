# GitHub Repository Setup Profile

This runbook sets up a new GitHub repository with this project's standard
configuration so the same settings, branch protection, and release-tag rules
are applied every time without reviewing other repositories first. Follow it
top to bottom and treat every remote change as one reviewed installation.

The runbook changes remote configuration only. It never writes files into the
target repository. A reader that only needs the result can stop after the
verification step.

## Safety rules for the agent

1. Read the current state first and show the complete plan before any write:
   the repository-settings diff and the rulesets to create or update.
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

The authenticated account must have repository administration access. Replace
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

## 5. Verify and report

Read back the applied state:

```sh
gh api repos/{owner}/{repo} \
  --jq '{squash: .allow_squash_merge, merge: .allow_merge_commit, rebase: .allow_rebase_merge, auto_merge: .allow_auto_merge, delete_branch: .delete_branch_on_merge, wiki: .has_wiki, discussions: .has_discussions}'
gh api repos/{owner}/{repo}/rulesets --jq '.[] | {name, enforcement, target}'
gh api repos/{owner}/{repo}/rules/branches/{branch} \
  --jq '.[] | {rule: .type, parameters: .parameters}'
```

Report one table with the repository settings, each ruleset with its
enforcement state, and the effective rules on the default branch. Confirm that
no duplicate rulesets were created and state which steps, if any, remain
manual.

## 6. Settings without a public API (manual)

These stay unchanged and require the repository settings page:

- Disable release immutability and Sponsorships.
- Allow comments on individual commits.
- Do not enable the preview limit for branches and tags updated in one push.
- Automatically close issues linked to merged pull requests.
- Do not include Git LFS objects in source archives.

## 7. Out of scope

- Automated application of this profile through the CLI, including staged
  remote actions and a dedicated confirmation flow: deferred. See
  `docs/future-ideas.md` in the zrub repository for the designed stages.
- npm provenance: requires publishing from CI with OIDC on a public
  repository.
