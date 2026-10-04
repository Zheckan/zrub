import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type {
  LoadedResource,
  LoadedResourceFile,
  ResourceKind,
} from '../../src/catalog/types.js';
import { wrapManagedBlock } from '../../src/installer/managed-block.js';
import { planInstallation } from '../../src/installer/plan-installation.js';
import { withTempDirectory } from '../helpers/temp-project.js';

interface ResourceOptions {
  id?: string;
  kind?: ResourceKind;
  content?: string;
  destination?: string;
  managed?: boolean;
  existingSource?: string;
}

async function createResource(
  directory: string,
  {
    id = 'sample-guide',
    kind = 'guide',
    content = '# New guide\n',
    destination = 'docs/guide.md',
    managed = false,
    existingSource,
  }: ResourceOptions = {},
): Promise<LoadedResource> {
  const resourceDirectory = path.join(directory, 'catalog', id);
  const sourcePath = path.join(resourceDirectory, 'guide.md');
  await mkdir(resourceDirectory, { recursive: true });
  await writeFile(sourcePath, content);

  let existingSourcePath: string | undefined;
  if (existingSource !== undefined) {
    existingSourcePath = path.join(resourceDirectory, existingSource);
    await writeFile(existingSourcePath, '## Installed by zrub\n');
  }

  const file: LoadedResourceFile = {
    source: 'guide.md',
    sourcePath,
    destination,
    ...(managed ? { onExisting: 'managed-prepend-once' as const } : {}),
    ...(existingSourcePath === undefined ? {} : { existingSourcePath }),
  };

  return {
    schemaVersion: 1,
    id,
    name: id,
    description: `Description for ${id}`,
    kind,
    directoryPath: resourceDirectory,
    files: [file],
  };
}

describe('planInstallation', () => {
  it('plans creation without creating target files or parents', async () => {
    await withTempDirectory(async (directory) => {
      const targetRoot = path.join(directory, 'target');
      await mkdir(targetRoot);
      const resource = await createResource(directory);

      const plan = await planInstallation([resource], targetRoot);

      expect(plan).toEqual({
        targetRoot,
        operations: [
          {
            resourceId: 'sample-guide',
            sourcePath: resource.files[0]?.sourcePath,
            destinationPath: path.join(targetRoot, 'docs/guide.md'),
            kind: 'create',
            nextContent: '# New guide\n',
            template: false,
          },
        ],
        hasReplacementConflicts: false,
        hasBlockingConflicts: false,
      });
      await expect(
        readFile(path.join(targetRoot, 'docs/guide.md')),
      ).rejects.toThrow(/ENOENT/);
    });
  });

  it('classifies identical unmanaged content as unchanged', async () => {
    await withTempDirectory(async (directory) => {
      const targetRoot = path.join(directory, 'target');
      const destinationPath = path.join(targetRoot, 'docs/guide.md');
      await mkdir(path.dirname(destinationPath), { recursive: true });
      await writeFile(destinationPath, '# Same\n');
      const resource = await createResource(directory, { content: '# Same\n' });

      const plan = await planInstallation([resource], targetRoot);

      expect(plan.operations[0]).toMatchObject({ kind: 'unchanged' });
      expect(plan.operations[0]?.nextContent).toBeUndefined();
      expect(plan.hasReplacementConflicts).toBe(false);
    });
  });

  it('classifies different unmanaged content as a replacement conflict', async () => {
    await withTempDirectory(async (directory) => {
      const targetRoot = path.join(directory, 'target');
      const destinationPath = path.join(targetRoot, 'docs/guide.md');
      await mkdir(path.dirname(destinationPath), { recursive: true });
      await writeFile(destinationPath, '# Existing\n');
      const resource = await createResource(directory, { content: '# New\n' });

      const plan = await planInstallation([resource], targetRoot);

      expect(plan.operations[0]).toMatchObject({
        kind: 'replace-conflict',
        nextContent: '# New\n',
      });
      expect(plan.hasReplacementConflicts).toBe(true);
      expect(plan.hasBlockingConflicts).toBe(false);
      expect(await readFile(destinationPath, 'utf8')).toBe('# Existing\n');
    });
  });

  it('wraps a missing managed template for creation', async () => {
    await withTempDirectory(async (directory) => {
      const targetRoot = path.join(directory, 'target');
      await mkdir(targetRoot);
      const resource = await createResource(directory, {
        id: 'agents-project-guide',
        kind: 'template',
        managed: true,
        destination: 'AGENTS.md',
        content: '## Findings\n',
      });

      const plan = await planInstallation([resource], targetRoot);

      expect(plan.operations[0]).toMatchObject({
        kind: 'create',
        nextContent: wrapManagedBlock('agents-project-guide', '## Findings\n'),
        template: true,
      });
    });
  });

  it('prepends a managed template above existing content', async () => {
    await withTempDirectory(async (directory) => {
      const targetRoot = path.join(directory, 'target');
      await mkdir(targetRoot);
      await writeFile(path.join(targetRoot, 'AGENTS.md'), '# Existing\n');
      const resource = await createResource(directory, {
        id: 'agents-project-guide',
        kind: 'template',
        managed: true,
        destination: 'AGENTS.md',
        content: '## Findings\n',
      });

      const plan = await planInstallation([resource], targetRoot);

      expect(plan.operations[0]).toMatchObject({
        kind: 'prepend',
        nextContent: `${wrapManagedBlock(
          'agents-project-guide',
          '## Findings\n',
        )}\n# Existing\n`,
      });
    });
  });

  it('prepends only the existing-source payload above existing content', async () => {
    await withTempDirectory(async (directory) => {
      const targetRoot = path.join(directory, 'target');
      await mkdir(targetRoot);
      await writeFile(path.join(targetRoot, 'AGENTS.md'), '# Existing\n');
      const resource = await createResource(directory, {
        id: 'agents-project-guide',
        kind: 'template',
        managed: true,
        destination: 'AGENTS.md',
        content: '## Full template that must not be prepended\n',
        existingSource: 'AGENTS.existing.md',
      });

      const plan = await planInstallation([resource], targetRoot);

      expect(plan.operations[0]).toMatchObject({
        kind: 'prepend',
        nextContent: `${wrapManagedBlock(
          'agents-project-guide',
          '## Installed by zrub\n',
        )}\n# Existing\n`,
      });
    });
  });

  it('preserves an edited installed managed block byte-for-byte', async () => {
    await withTempDirectory(async (directory) => {
      const targetRoot = path.join(directory, 'target');
      await mkdir(targetRoot);
      const installed = `${wrapManagedBlock(
        'agents-project-guide',
        'User-edited findings\n',
      )}\n# Existing\n`;
      const destinationPath = path.join(targetRoot, 'AGENTS.md');
      await writeFile(destinationPath, installed);
      const resource = await createResource(directory, {
        id: 'agents-project-guide',
        kind: 'template',
        managed: true,
        destination: 'AGENTS.md',
        content: 'Package update that must not replace edits\n',
      });

      const plan = await planInstallation([resource], targetRoot);

      expect(plan.operations[0]).toMatchObject({ kind: 'already-installed' });
      expect(plan.operations[0]?.nextContent).toBeUndefined();
      expect(await readFile(destinationPath, 'utf8')).toBe(installed);
    });
  });

  it('blocks execution when managed markers are malformed', async () => {
    await withTempDirectory(async (directory) => {
      const targetRoot = path.join(directory, 'target');
      await mkdir(targetRoot);
      await writeFile(
        path.join(targetRoot, 'AGENTS.md'),
        '<!-- zrub:agents-project-guide:start -->\n',
      );
      const resource = await createResource(directory, {
        id: 'agents-project-guide',
        kind: 'template',
        managed: true,
        destination: 'AGENTS.md',
      });

      const plan = await planInstallation([resource], targetRoot);

      expect(plan.operations[0]).toMatchObject({
        kind: 'malformed-markers-conflict',
        conflictReason: expect.any(String),
      });
      expect(plan.hasBlockingConflicts).toBe(true);
    });
  });

  it('keeps selected-resource and file order stable', async () => {
    await withTempDirectory(async (directory) => {
      const targetRoot = path.join(directory, 'target');
      await mkdir(targetRoot);
      const alpha = await createResource(directory, { id: 'alpha' });
      const beta = await createResource(directory, {
        id: 'beta',
        destination: 'docs/beta.md',
      });
      const secondAlphaSource = path.join(alpha.directoryPath, 'second.md');
      await writeFile(secondAlphaSource, '# Second\n');
      alpha.files.push({
        source: 'second.md',
        sourcePath: secondAlphaSource,
        destination: 'docs/second.md',
      });

      const plan = await planInstallation([beta, alpha], targetRoot);

      expect(plan.operations.map((operation) => operation.resourceId)).toEqual([
        'beta',
        'alpha',
        'alpha',
      ]);
      expect(
        plan.operations.map((operation) =>
          path.relative(targetRoot, operation.destinationPath),
        ),
      ).toEqual(['docs/beta.md', 'docs/guide.md', 'docs/second.md']);
    });
  });
});
