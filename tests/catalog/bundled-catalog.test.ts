import { describe, expect, it } from 'vitest';

import { bundledResourcesRoot } from '../../src/catalog/bundled-root.js';
import { loadCatalog } from '../../src/catalog/load-catalog.js';

describe('bundled catalog', () => {
  it('contains the bundled resources with their installation mappings', async () => {
    const resources = await loadCatalog(bundledResourcesRoot());

    expect(
      resources.map(({ id, kind, files }) => ({
        id,
        kind,
        files: files.map(
          ({ source, destination, onExisting, existingSource }) => ({
            source,
            destination,
            onExisting,
            existingSource,
          }),
        ),
      })),
    ).toEqual([
      {
        id: 'agents-project-guide',
        kind: 'template',
        files: [
          {
            source: 'AGENTS.md',
            destination: './',
            onExisting: 'managed-prepend-once',
            existingSource: 'AGENTS.existing.md',
          },
          {
            source: 'findings.md',
            destination: 'docs/findings.md',
            onExisting: undefined,
          },
          {
            source: 'zrub.md',
            destination: 'docs/project-guides/zrub.md',
            onExisting: undefined,
          },
        ],
      },
      {
        id: 'frontend-project-structure',
        kind: 'guide',
        files: [
          {
            source: 'frontend-project-structure.md',
            destination: 'docs/project-guides/frontend-project-structure.md',
            onExisting: undefined,
          },
        ],
      },
      {
        id: 'general-project-guidelines',
        kind: 'guide',
        files: [
          {
            source: 'general-project-guidelines.md',
            destination: 'docs/project-guides/general-project-guidelines.md',
            onExisting: undefined,
          },
        ],
      },
      {
        id: 'github-repo-setup-profile',
        kind: 'guide',
        files: [
          {
            source: 'github-repo-setup-profile.md',
            destination: 'docs/project-guides/github-repo-setup-profile.md',
            onExisting: undefined,
          },
        ],
      },
      {
        id: 'typescript-ci-setup',
        kind: 'guide',
        files: [
          {
            source: 'typescript-ci-setup.md',
            destination: 'docs/project-guides/typescript-ci-setup.md',
            onExisting: undefined,
          },
        ],
      },
    ]);
  });

  it('resolves resources beside source and compiled catalog modules', () => {
    const sourceModuleUrl = new URL(
      '../../src/catalog/bundled-root.ts',
      import.meta.url,
    ).href;
    const compiledModuleUrl = new URL(
      '../../dist/catalog/bundled-root.js',
      import.meta.url,
    ).href;

    expect(bundledResourcesRoot(sourceModuleUrl)).toBe(
      bundledResourcesRoot(compiledModuleUrl),
    );
  });
});
