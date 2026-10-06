# TypeScript CI setup

Use this guide when creating GitHub Actions CI for a TypeScript project or
changing how its checks are grouped. Adapt one example into the target
project's `.github/workflows/ci.yml`. Keep this CI guide separate from the
GitHub repository settings runbook. Reading or installing this guide does not
create the workflow; applying it produces the project-specific workflow file.

## 1. Inspect the project and confirm the layout

Read `AGENTS.md`, `package.json`, the lockfile, runtime version files, existing
workflows, and required status checks. Identify the actual format, lint,
typecheck, test, and build commands. Keep checks that already protect the
project, including browser tests, package checks, or mobile exports.

Before selecting or changing a layout, ask the user:

> Do you prefer separate PR checks for clearer failure visibility and
> independent reruns, or one shared job to reduce repeated setup and runner
> usage? Separate jobs can finish sooner in parallel; a shared job uses named
> steps and a results table, with one overall PR check.

Wait for the answer before choosing a layout. An explicit choice already made
for this project satisfies this step. Record the selected layout and its check
names in the project's CI documentation so future agents can keep it.

| Layout           | PR results and reruns                                                        | Setup and time                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Separate jobs    | Each category has its own native check, logs, and failed-job rerun           | Each job installs dependencies. Parallel jobs can reduce elapsed time but repeat runner work.                            |
| Consolidated job | One native check, named steps, and a results table. A rerun repeats the job. | One dependency installation. Checks run sequentially and generally use less total runner time when setup is substantial. |

A workflow run contains jobs; jobs contain steps. Multiple jobs in one
workflow still produce separate native checks. Splitting the same checks into
multiple workflow files is optional and does not itself reduce their work.
Choose grouping independently of file organization, and remove duplicate
invocations of a check after accounting for their coverage and triggers.

## 2. Map the examples to the project

These examples use pnpm, Node.js 24, a committed `pnpm-lock.yaml`, and an exact
pnpm version in `package.json`'s `packageManager` field. Match the target
project's runtime and package manager. For a project that already uses npm,
Yarn, or Bun, keep its lockfile and adapt setup, caching, and install commands.

- Use the repository's runtime version file through `node-version-file` when
  available. Check compatibility with `engines` and the pinned package manager.
- Keep dependency installation explicit and frozen. Configure pnpm before
  `setup-node`'s pnpm cache lookup. This cache stores package data, so each job
  still needs an installation; it does not share `node_modules` between jobs.
- Map `format:check`, `lint`, `typecheck`, `test`, and `build` to real scripts.
  For example, Geomatrix calls formatting `lint:format`. If a category is
  missing, agree its tool and command or omit the category and update all
  names and summaries. Keep failures visible; avoid commands that succeed
  merely because no tests were found.
- Use non-mutating format and lint checks. Preserve the project's linter,
  type-aware rules, generated-file exclusions, and production checks.
- Account for generation or environment prerequisites. A build that generates
  types may require that generation before typecheck. Run dependent steps only
  after their prerequisites succeed. Keep ordinary PR validation runnable
  without deployment credentials where the project permits it.
- Use `pull_request` for PR validation, `push` on the actual default branch,
  read-only contents permission, a timeout, and cancellation of superseded
  runs. Add `merge_group` if a merge queue requires these checks.
- The action references below were verified on 2026-10-06. Resolve trusted
  releases to commit SHAs when adapting them, and keep version comments in
  sync. These action versions do not determine the project's Node.js version.

## 3A. Separate jobs for individual check results

This matrix creates five independent jobs with stable names. `fail-fast:
false` lets the remaining categories finish after one fails. No job waits for
another category that it does not depend on.

```yaml
name: TypeScript CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  checks:
    name: ${{ matrix.name }}
    runs-on: ubuntu-latest
    timeout-minutes: 15
    strategy:
      fail-fast: false
      matrix:
        include:
          - name: Format
            script: format:check
          - name: Lint
            script: lint
          - name: Typecheck
            script: typecheck
          - name: Tests
            script: test
          - name: Build
            script: build
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
      - uses: pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86 # v6
        with:
          run_install: false
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
        with:
          node-version: 24
          cache: pnpm
          cache-dependency-path: pnpm-lock.yaml
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: ${{ matrix.name }}
        run: pnpm run ${{ matrix.script }}
```

Use explicit jobs instead of a matrix when categories need different services,
operating systems, or setup. Keep the same descriptive names. Splitting jobs
across workflow files is also valid when their triggers differ.

## 3B. Consolidated job for lower runner usage

This job installs once and runs each category as a named step. Later checks
run after an earlier check fails, provided installation succeeded and the run
was not cancelled. Each failed check still fails the job. The summary shows
all outcomes, including skipped checks.

```yaml
name: TypeScript CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  checks:
    name: Format, Lint, Typecheck, Tests, and Build
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
      - uses: pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86 # v6
        with:
          run_install: false
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
        with:
          node-version: 24
          cache: pnpm
          cache-dependency-path: pnpm-lock.yaml
      - name: Install dependencies
        id: install
        run: pnpm install --frozen-lockfile
      - name: Format
        id: format
        if: ${{ !cancelled() && steps.install.outcome == 'success' }}
        run: pnpm format:check
      - name: Lint
        id: lint
        if: ${{ !cancelled() && steps.install.outcome == 'success' }}
        run: pnpm lint
      - name: Typecheck
        id: typecheck
        if: ${{ !cancelled() && steps.install.outcome == 'success' }}
        run: pnpm typecheck
      - name: Tests
        id: tests
        if: ${{ !cancelled() && steps.install.outcome == 'success' }}
        run: pnpm test
      - name: Build
        id: build
        if: ${{ !cancelled() && steps.install.outcome == 'success' }}
        run: pnpm build
      - name: Results
        if: ${{ always() }}
        env:
          INSTALL_RESULT: ${{ steps.install.outcome || 'skipped' }}
          FORMAT_RESULT: ${{ steps.format.outcome || 'skipped' }}
          LINT_RESULT: ${{ steps.lint.outcome || 'skipped' }}
          TYPECHECK_RESULT: ${{ steps.typecheck.outcome || 'skipped' }}
          TEST_RESULT: ${{ steps.tests.outcome || 'skipped' }}
          BUILD_RESULT: ${{ steps.build.outcome || 'skipped' }}
        run: |
          {
            printf '## CI results\n\n'
            printf '| Check | Result |\n| --- | --- |\n'
            printf '| Install dependencies | %s |\n' "$INSTALL_RESULT"
            printf '| Format | %s |\n' "$FORMAT_RESULT"
            printf '| Lint | %s |\n' "$LINT_RESULT"
            printf '| Typecheck | %s |\n' "$TYPECHECK_RESULT"
            printf '| Tests | %s |\n' "$TEST_RESULT"
            printf '| Build | %s |\n' "$BUILD_RESULT"
          } >> "$GITHUB_STEP_SUMMARY"
```

Keep separate steps when every category must report an outcome. An aggregate
script that stops on the first failure cannot supply those results. Keep the
failure result of each step intact; `continue-on-error` would require an
additional failure gate. If generation is a prerequisite, add its successful
outcome to the condition on the checks that consume its output.

## 4. Preserve coverage and match required checks

Use one layout for the same check set. Remove superseded workflow jobs when
switching so every push does not run both versions. Keep platform, runtime,
browser, and packaging coverage that has a distinct purpose. Add a runtime
matrix only when compatibility across those versions is a requirement.

Browser tests may need a separate job for browser installation and failure
artifacts. Mobile exports are a build check, with native device verification a
separate concern. Deployment and publishing remain separate workflows with
their own credentials and authorization.

Before changing job names, inspect required contexts. After the new workflow
has produced a run, verify the exact native names:

```sh
gh api repos/{owner}/{repo}/commits/{commit-sha}/check-runs \
  --jq '[.check_runs[].name] | unique'
```

For the separate example, expect `Format`, `Lint`, `Typecheck`, `Tests`, and
`Build`. For the consolidated example, expect
`Format, Lint, Typecheck, Tests, and Build`. Matrix expansion and other workflows
can affect actual names, so read them back rather than assuming.

Coordinate workflow and protection changes using the
[GitHub repository setup profile](https://github.com/Zheckan/zrub/blob/main/resources/github-repo-setup-profile/github-repo-setup-profile.md)
and the user's existing authorization for remote writes. Preserve required
coverage during migration, add the verified replacement contexts, and remove
obsolete ones. Keeping required names that no longer run blocks merging.
Avoid workflow-level path filters that prevent required checks from reporting.

Run the selected commands locally, validate workflow syntax, and review the
diff. Verify a hosted run after publication before claiming CI passed. Confirm
that check failures fail their job and that effective branch rules require
the intended checks. Report pending hosted validation if only local checks
have run.

For runtime limits, compare total runner duration as well as elapsed time.
Measure before and after on comparable commits. Dependency caching,
cancellation of obsolete runs, and removing duplicated checks can help both
layouts. Private repositories consume their owner's Actions allowance;
standard hosted runners in public repositories are free under GitHub's current
billing policy. Consolidation does not guarantee a faster result or a specific
saving.

## Source patterns and references

The examples adapt these repositories, inspected on 2026-10-06:

- Gymrat's `main` uses separate [quality jobs](https://github.com/Zheckan/gymrat/blob/69344ea9dd47eaf373bde1680739ba3db3d9541e/.github/workflows/code-quality.yml)
  and [test/build jobs](https://github.com/Zheckan/gymrat/blob/69344ea9dd47eaf373bde1680739ba3db3d9541e/.github/workflows/tests.yml).
  Its `redesign/fixes` branch has the [consolidated job with named steps and a summary](https://github.com/Zheckan/gymrat/blob/d4530033e2aada932beb690fb4d6352eb432bfdc/.github/workflows/ci.yml).
- [HBK](https://github.com/Zheckan/hbk-coding-challenge/blob/ad02bfe59c7ea11a4bad189c51db07b0a1b87c3f/.github/workflows/ci.yml)
  uses separate pnpm jobs, including browser tests.
- [Life Calendar](https://github.com/Zheckan/life-calendar/blob/8fc26a8d7e98e526d81d7dab07f325b23e5a7744/.github/workflows/ci.yml)
  uses separate Bun format, lint, and build jobs.
- [Geomatrix](https://github.com/Zheckan/geomatrix/blob/c4de7ff2b1659ecbe4faa85a732e838fd4043096/.github/workflows/ci.yml)
  uses one pnpm job with code generation before its checks.
- [Zrub](https://github.com/Zheckan/zrub/blob/main/.github/workflows/ci.yml)
  checks multiple supported Node.js versions and the packed CLI. That matrix
  validates compatibility and is distinct from splitting checks by category.

Some source repositories are private. Their links are provenance for readers
with access; the setup steps and examples above are self-contained.

Official references:

- [Workflow syntax, job names, matrices, permissions, and concurrency](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [Status check functions and failure conditions](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#status-check-functions)
- [Job summaries](https://docs.github.com/en/actions/reference/workflow-commands-for-github-actions#adding-a-job-summary)
- [Node.js setup and package caching](https://github.com/actions/setup-node)
- [pnpm setup and package-manager version selection](https://github.com/pnpm/action-setup)
- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
