import { mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadCatalog } from '../../src/catalog/load-catalog.js';
import { withTempDirectory } from '../helpers/temp-project.js';

interface TestResource {
  directoryName: string;
  id?: string;
  files?: Array<{ source: string; destination: string }>;
}

async function writeResource(
  catalogRoot: string,
  {
    directoryName,
    id = directoryName,
    files = [{ source: 'guide.md', destination: 'docs/guides/' }],
  }: TestResource,
): Promise<string> {
  const resourceDirectory = path.join(catalogRoot, directoryName);
  await mkdir(resourceDirectory, { recursive: true });
  await writeFile(
    path.join(resourceDirectory, 'resource.json'),
    JSON.stringify({
      schemaVersion: 1,
      id,
      name: `Resource ${id}`,
      description: `Description for ${id}`,
      kind: 'guide',
      files,
    }),
  );

  for (const file of files) {
    const sourcePath = path.join(resourceDirectory, file.source);
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, `# ${id}\n`);
  }

  return resourceDirectory;
}

describe('loadCatalog', () => {
  it('loads resources by id with resolved multi-file payloads', async () => {
    await withTempDirectory(async (catalogRoot) => {
      await writeResource(catalogRoot, {
        directoryName: 'first-folder',
        id: 'zeta-guide',
      });
      const alphaDirectory = await writeResource(catalogRoot, {
        directoryName: 'second-folder',
        id: 'alpha-guide',
        files: [
          { source: 'one.md', destination: 'docs/one.md' },
          { source: 'nested/two.md', destination: 'docs/two.md' },
        ],
      });

      const resources = await loadCatalog(catalogRoot);

      expect(resources.map((resource) => resource.id)).toEqual([
        'alpha-guide',
        'zeta-guide',
      ]);
      expect(resources[0]?.directoryPath).toBe(alphaDirectory);
      expect(resources[0]?.files.map((file) => file.sourcePath)).toEqual([
        path.join(alphaDirectory, 'one.md'),
        path.join(alphaDirectory, 'nested/two.md'),
      ]);
    });
  });

  it('rejects malformed resource JSON', async () => {
    await withTempDirectory(async (catalogRoot) => {
      const resourceDirectory = path.join(catalogRoot, 'broken');
      await mkdir(resourceDirectory);
      await writeFile(path.join(resourceDirectory, 'resource.json'), '{');

      await expect(loadCatalog(catalogRoot)).rejects.toThrow(
        /Unable to parse resource metadata.*broken/,
      );
    });
  });

  it('rejects duplicate resource ids', async () => {
    await withTempDirectory(async (catalogRoot) => {
      await writeResource(catalogRoot, {
        directoryName: 'one',
        id: 'shared-id',
      });
      await writeResource(catalogRoot, {
        directoryName: 'two',
        id: 'shared-id',
      });

      await expect(loadCatalog(catalogRoot)).rejects.toThrow(
        'Duplicate resource id: shared-id',
      );
    });
  });

  it('rejects a resource directory without metadata', async () => {
    await withTempDirectory(async (catalogRoot) => {
      await mkdir(path.join(catalogRoot, 'missing-metadata'));

      await expect(loadCatalog(catalogRoot)).rejects.toThrow(
        /Missing resource metadata.*missing-metadata/,
      );
    });
  });

  it('rejects a missing payload file', async () => {
    await withTempDirectory(async (catalogRoot) => {
      const resourceDirectory = await writeResource(catalogRoot, {
        directoryName: 'missing-payload',
      });
      await writeFile(
        path.join(resourceDirectory, 'resource.json'),
        JSON.stringify({
          schemaVersion: 1,
          id: 'missing-payload',
          name: 'Missing payload',
          description: 'References a missing payload.',
          kind: 'guide',
          files: [{ source: 'absent.md', destination: 'docs/' }],
        }),
      );

      await expect(loadCatalog(catalogRoot)).rejects.toThrow(
        /Payload not found.*absent\.md/,
      );
    });
  });

  it('rejects payload symlinks that could escape a resource directory', async () => {
    await withTempDirectory(async (catalogRoot) => {
      const resourceDirectory = await writeResource(catalogRoot, {
        directoryName: 'linked-payload',
      });
      const outsideFile = path.join(catalogRoot, 'outside.md');
      await writeFile(outsideFile, '# Outside\n');
      await writeFile(
        path.join(resourceDirectory, 'resource.json'),
        JSON.stringify({
          schemaVersion: 1,
          id: 'linked-payload',
          name: 'Linked payload',
          description: 'References a symbolic link.',
          kind: 'guide',
          files: [{ source: 'escape.md', destination: 'docs/' }],
        }),
      );
      await symlink(outsideFile, path.join(resourceDirectory, 'escape.md'));

      await expect(loadCatalog(catalogRoot)).rejects.toThrow(
        /Payload must be a regular file.*escape\.md/,
      );
    });
  });
});
