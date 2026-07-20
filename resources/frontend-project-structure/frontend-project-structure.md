# Frontend Project Structure

Paths in this guide are relative to `frontend/`. Use this structure as a
direction, not as a requirement to create empty folders. Add folders when the
code needs them.

## Main Idea

- Keep routing and app providers at the top level.
- Keep pages very thin.
- Put real product logic inside `features`.
- Put reusable business/domain logic inside `domain`.
- Put reusable UI primitives and layout pieces inside `ui`.
- Put environment, API, constants, and generated configuration in `config`.
- Keep tests, stories, and page objects close to the code they cover.

## Suggested Shape

```text
frontend/
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
- `App.tsx` wires app-wide providers such as router, query client, theme
  provider, and other global context providers.
- `RootRouter.tsx` defines routes and maps routes to page modules.
- `pages/*` should be thin route wrappers that mostly render a feature
  container.
- `features/*` are product modules. Each feature owns its own container, views,
  components, logic, types, tests, stories, and page objects.
- Use a container/view split:
  - `FeatureContainer.tsx` fetches data, calls hooks, handles state, and prepares props.
  - `views/FeatureView.tsx` renders the page from props and stays mostly
    presentational.
  - `logic/` contains hooks, form logic, validation, calculations, and data
    shaping.
  - `components/` contains feature-specific UI pieces.
- `domain/*` contains reusable business logic that can be shared across
  features. It should not be tied to one page.
- `ui/*` is the design system layer:
  - `atoms` are small primitives.
  - `molecules` are composed reusable UI pieces.
  - `organisms` are larger reusable UI sections.
  - `layouts` define page/app layout shells.
- Prefer absolute imports from `@/`, mapping to `src/*`.
- Keep shared interfaces small and let modules hide implementation complexity
  behind hooks, containers, or utility functions.
