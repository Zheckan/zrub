# Future Ideas

These ideas are intentionally outside the current MVP. Each requires its own
design and approval before implementation.

## Read-once access for every document

Every catalog document should support a read-once mode that returns its
contents to the user or agent without installing a copy in the target project.
Make this available to all documents, including project guides, prompts,
setup runbooks, and document templates. It must not be a special case limited
to GitHub setup or another selected resource.

Reading a document must not create project files, managed blocks, or an
installation record. Keep reading separate from executing its instructions:
a user can read a setup runbook without authorizing the remote changes it
describes. If the user asks the agent to apply instructions, use the normal
authorization and review flow for those actions.

GitHub repository setup is a one-off use of this general mode. Read and follow
the runbook from its source without adding it to the project. CI setup uses a
separate guide and produces a project-specific workflow file such as
`.github/workflows/ci.yml`; that output is distinct from installing the guide.

Design how users and agents discover, select, and retrieve a document before
implementing this mode. The existing CLI currently supports file installation.

## Global agent skills

Support distributing and installing agent skills globally so the same workflow
can be used across projects. A skill includes its `SKILL.md` and any referenced
scripts, examples, templates, or other supporting files.

Design this separately from project document installation:

- Detect the selected agent's supported global skill location and confirm the
  target agent and scope when they are ambiguous.
- Keep the complete skill directory together and preserve relative references.
- Review creates, updates, and conflicts before writing; preserve user changes
  and unrelated skills.
- Define discovery, version tracking, updates, and removal for global skills.
- Validate every payload path within its declared skill root and validate the
  destination using the same containment rules as project resources.

The current resource schema and project installer do not yet implement global
skill installation.

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

### Application stages

Treat applying the profile as one reviewed setup task with ordered stages:

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
- Disable merge commits, rebase merging, and update-branch suggestions.
- Enable auto-merge so approved pull requests can merge after every ruleset
  requirement passes.
- Automatically delete head branches after merge.
- Do not require signoff for commits made through the GitHub web interface.
- Allow comments on individual commits.
- Do not include Git LFS objects in source archives.
- Do not enable the preview limit for branches and tags updated in one push.
- Automatically close issues linked to merged pull requests.

The matching branch ruleset should be applied as part of the same profile so
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
