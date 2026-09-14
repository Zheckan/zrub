# Project Structure

Use this structure as a direction, not as a requirement to create empty folders.
Add folders when the code needs them.

## Main idea

- Keep routing and app providers at the top level.
- Keep pages very thin.
- Put real product logic inside `features`.
- Put reusable business and domain logic inside `domain`.
- Put reusable UI components and layouts inside `ui`.
- Put environment, API, constants, and generated configuration in `config`.
- Keep tests, stories, and page objects close to the code they cover.

## Suggested shape

```text
src/
  main.tsx
  App.tsx
  RootRouter.tsx

  pages/
    Root.tsx
    FeaturePage.tsx

  features/
    feature/
      FeatureContainer.tsx
      views/
        FeatureView.tsx
      components/
      logic/
      types.ts

  domain/
    state/
    business-logic/
    data-access/
    analytics/
    hooks/
    errors/
    types/

  ui/
    atoms/
    molecules/
    organisms/
    layouts/
    assets/
    charts/
    utils/

  config/
    paths.ts
    consts.ts
    query-client.ts
    feature-flags/
    api/
    generated/

  utils/
  test/
  css/
  fonts/
  exports/
```

## Rules

- `main.tsx` only boots React and global CSS.
- `App.tsx` wires app-wide providers such as the router, query client, theme
  provider, and other global context providers.
- `RootRouter.tsx` defines routes and maps them to page modules.
- `pages/*` should be thin route wrappers that mostly render a feature
  container.
- `features/*` are product modules. Each feature owns its container, views,
  components, logic, types, tests, stories, and page objects.
- Use a container and view split when it provides a useful boundary:
  - `FeatureContainer.tsx` fetches data, calls hooks, handles state, and prepares
    props.
  - `views/FeatureView.tsx` renders the page from props and stays mostly
    presentational.
  - `logic/` contains hooks, form logic, validation, calculations, and data
    shaping.
  - `components/` contains feature-specific UI pieces.
- `domain/*` contains reusable business logic shared across features. It should
  not depend on one page.
- `ui/*` is the design system layer:
  - `atoms` are small components.
  - `molecules` are composed reusable UI pieces.
  - `organisms` are larger reusable UI sections.
  - `layouts` define page and application layout shells.
- Prefer absolute imports from `@/`, mapped to `src/*`.
- Keep shared interfaces small. Hide implementation details behind hooks,
  containers, or utility functions.

## Hook ownership and data flow

- Feature containers own feature-level hooks, data fetching, state, and side
  effects.
- Containers pass hook results, including state, derived data, and event
  handlers, to views and presentational components through props.
- Views focus on rendering and user-interaction wiring.
- Do not call feature-specific hooks deep inside presentational components
  unless the hook is intentionally reusable there.
- When a module needs a replaceable hook or service, pass it explicitly as a
  dependency.

## Unified fix and verification command

Provide a root-level `pnpm fix` command that:

1. Formats the code and applies configured lint fixes.
2. Runs the verification checks for the project and every workspace package.
3. Stops immediately if formatting, lint fixes, or any verification step fails.

Verification should include linting, tests, type checking, and any
project-specific validation scripts. Independent checks may run in parallel to
reduce execution time, but failures must still produce a non-zero exit code.
