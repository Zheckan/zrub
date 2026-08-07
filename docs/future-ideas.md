# Future Ideas

These ideas are intentionally outside the current MVP. Each requires its own
design and approval before implementation.

## GitHub ruleset resources

Allow the catalog to contain reusable GitHub ruleset templates and optionally
apply them to the current repository through `gh api`.

Rulesets are remote configuration, not filesystem resources. Applying one can
immediately change who may push or merge, so this feature needs a separate
remote-action flow with stronger safeguards:

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

The GitHub CLI does not need a dedicated ruleset command because its API
adapter can call the repository ruleset endpoint:

```sh
jq 'del(.id, .source_type, .source)' ruleset.json |
  gh api --method POST repos/{owner}/{repo}/rulesets --input -
```

The exported `main-protection` example is useful source material but is not a
portable template as-is. Its required `ci` status check, bypass actor IDs, and
Copilot review rule may be invalid or unavailable in another repository.

References:

- [REST API endpoints for repository rulesets](https://docs.github.com/en/rest/repos/rules)
- [Creating repository rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository)
