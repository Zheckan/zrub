# Future Ideas

These ideas are intentionally outside the current MVP. Each requires its own
design and approval before implementation.

## GitHub repository setup profiles

Allow the catalog to contain reusable GitHub repository profiles. A profile
combines general repository settings with one or more ruleset templates and can
optionally apply the complete setup to the current repository through `gh api`.

Repository settings and rulesets are remote configuration, not filesystem
resources. Applying a profile can immediately change repository features and
who may push or merge, so this feature needs a separate remote-action flow with
stronger safeguards:

- Detect and display the exact target GitHub repository.
- Verify `gh` authentication and repository administration permission.
- Remove response-only export fields such as `id`, `source`, and
  `source_type` before creating a ruleset.
- Resolve repository-specific values instead of copying them blindly,
  including the default branch, required status-check names, bypass actors,
  teams, and GitHub Apps.
- Validate optional rules such as automatic Copilot review against the target
  account's plan and policies.
- Show the complete remote change and require a dedicated confirmation.
- Check for an existing ruleset with the same name and never silently create a
  duplicate or replace it.
- Prefer creating a ruleset disabled initially unless the user explicitly
  selects active enforcement.
- Read the ruleset back after creation and report the verified result.

### Installation stages

Treat the profile as one reviewed installation with ordered stages:

1. Read and snapshot the current repository settings and rulesets.
2. Resolve target-specific values such as the default branch and status-check
   names.
3. Show one combined diff for general settings and rulesets.
4. Require explicit confirmation for the complete remote profile.
5. Apply supported general repository settings.
6. Create or update the approved rulesets.
7. Read everything back and report verified changes, unsupported settings, and
   any partial failure. Keep the original snapshot available for recovery; do
   not attempt an unsafe automatic rollback.

### Initial settings preset

The first profile should reproduce this repository configuration:

- Keep the repository as a normal repository rather than a template.
- Disable release immutability, Wikis, Sponsorships, and Discussions.
- Enable Issues, Projects, and Pull requests.
- Allow squash merging only, using GitHub's default squash commit message.
- Disable merge commits, rebase merging, update-branch suggestions, and
  auto-merge.
- Automatically delete head branches after merge.
- Do not require signoff for commits made through the GitHub web interface.
- Allow comments on individual commits.
- Do not include Git LFS objects in source archives.
- Do not enable the preview limit for branches and tags updated in one push.
- Automatically close issues linked to merged pull requests.

The matching branch ruleset should be installed as part of the same profile so
its allowed merge methods and required checks agree with the general settings.
Before applying, the CLI must identify settings unavailable through the public
API or unsupported by the target repository's plan and leave them unchanged
with clear manual instructions.

The GitHub CLI does not need dedicated settings or ruleset commands. Its API
adapter can patch supported repository settings and call the repository
ruleset endpoint:

```sh
gh api --method PATCH repos/{owner}/{repo} --input repository-settings.json
```

```sh
jq 'del(.id, .source_type, .source)' ruleset.json |
  gh api --method POST repos/{owner}/{repo}/rulesets --input -
```

The exported `main-protection` example is useful source material but is not a
portable template as-is. Its required `ci` status check, bypass actor IDs, and
Copilot review rule may be invalid or unavailable in another repository.

References:

- [REST API endpoint for updating a repository](https://docs.github.com/en/rest/repos/repos#update-a-repository)
- [REST API endpoints for repository rulesets](https://docs.github.com/en/rest/repos/rules)
- [Creating repository rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository)
