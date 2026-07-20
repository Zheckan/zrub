import { describe, expect, it } from 'vitest';

import { bundledResourcesRoot } from '../../src/catalog/bundled-root.js';
import { loadCatalog } from '../../src/catalog/load-catalog.js';

describe('bundled catalog', () => {
  it('contains the two initial resources', async () => {
    const resources = await loadCatalog(bundledResourcesRoot());

    expect(
      resources.map(({ id, kind, files }) => ({
        id,
        kind,
        files: files.map(({ source, destination, onExisting }) => ({
          source,
          destination,
          onExisting,
        })),
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
