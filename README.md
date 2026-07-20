# Project Blueprints

`project-blueprints` is an interactive CLI for installing reusable engineering
guides, prompts, templates, examples, and code into new or existing projects.

> The package is under development and has not been published to npm yet.

After publication, run it from a target project's root with Node.js 22 or
newer:

```sh
npx project-blueprints@latest
pnpm dlx project-blueprints@latest
yarn dlx project-blueprints@latest
bunx project-blueprints@latest
```

`yarn dlx` requires modern Yarn rather than Yarn Classic 1.x. `bunx` respects
the CLI's Node shebang, so Node.js remains required.

The CLI will:

1. Show the bundled resources in a checkbox menu.
2. Plan every filesystem operation without writing anything.
3. Show one complete review, including replacement conflicts.
4. Ask for one confirmation.
5. Apply the approved plan and summarize the result.

## Resource catalog

Publishable resources live in `resources/`. A resource is a self-contained
folder with `resource.json` metadata and one or more payload files. Supported
kinds are guides, prompts, templates, examples, and code.

Documentation about developing this repository belongs in `docs/`, not in the
publishable catalog.

## Development

Use pnpm 11.15.1 exclusively:

```sh
pnpm install
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

The package is not published as part of normal development or CI.
