# Expo Project Structure Resource Design

## Goal

Add a reusable Expo and React Native project-structure guide to the bundled
resource catalog. The guide must be applicable to general Expo applications
rather than preserving assumptions from the project-specific source document.

## Resource Contract

- ID: `expo-project-structure`
- Name: `Expo project structure`
- Kind: `guide`
- Payload: `expo-project-structure.md`
- Destination: `docs/project-guides/expo-project-structure.md`
- Existing-file behavior: use the catalog's normal reviewed full-file
  replacement flow; do not add a managed block policy.

## Guide Scope

The guide uses a single Expo application as its default topology:

```text
app/                          # Thin Expo Router routes
src/
  features/                  # Product behavior grouped by feature
  domain/                    # Portable models and pure business rules
  data/                      # Optional repositories and external adapters
  ui/                        # Shared UI, layouts, theme, and assets
  config/
  hooks/
  utils/
  test/
```

It explains these dependency rules:

- Expo Router files own routes, parameters, layouts, and metadata, but not
  product behavior or data-access implementation.
- Feature modules own feature-specific containers, views, components, logic,
  types, and tests.
- Domain modules contain framework-independent behavior when the application
  has business rules worth separating.
- Data repositories and adapters are introduced only when they hide a real
  persistence, network, device, or testing boundary.
- Shared UI hides meaningful repeated composition rather than wrapping every
  React Native primitive.
- Platform-specific files use `.ios.tsx`, `.android.tsx`, or `.native.tsx` only
  where behavior or presentation genuinely differs.
- Tests stay close to the interface or behavior they verify.

Monorepo packages are an optional later extraction for code that has a real
second consumer; they are not part of the default tree.

## Removed Project-Specific Content

The reusable guide must not mention Gymrat, workouts, web-to-mobile rewrites,
cutover or deletion rules, SQLite, local profiles, synchronization fields,
draft sessions, health integrations, Liquid Glass, Material 3, shadcn,
NativeWind, or project-specific package aliases.

Persistence remains technology-neutral. Generated `ios/` and `android/`
projects are described in terms of Expo prebuild and project requirements,
without requiring them to be committed or ignored universally.

## Catalog and Verification Changes

Create `resources/expo-project-structure/` with validated metadata and the
cleaned Markdown payload. Extend bundled-catalog acceptance coverage so the
resource's identity, description, destination, and payload are verified.

Update the package-content verifier to require both new resource files in the
npm tarball. Update the README's included-resource list and catalog maintenance
description. The full test, typecheck, build, format, package-content, and
four-launcher smoke suite must continue to pass.

All changes are committed and pushed to `package-verification`, the existing
head branch of PR #6. No additional PR is created, and nothing is published.
