import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type {
  LoadedResource,
  LoadedResourceFile,
  ResourceKind,
} from '../../src/catalog/types.js';
import {
  applyInstallationPlan,
  type FileWriter,
} from '../../src/installer/apply-plan.js';
import { wrapManagedBlock } from '../../src/installer/managed-block.js';
import { planInstallation } from '../../src/installer/plan-installation.js';
import type {
  InstallationOperation,
  InstallationOperationKind,
  InstallationPlan,
} from '../../src/installer/types.js';
import { withTempDirectory } from '../helpers/temp-project.js';

async function loadedResource(
  directory: string,
  options: {
    id: string;
    kind: ResourceKind;
    content: string;
    destination: string;
    managed?: boolean;
  },
): Promise<LoadedResource> {
  const resourceDirectory = path.join(directory, 'catalog', options.id);
  const sourcePath = path.join(resourceDirectory, 'payload.md');
  await mkdir(resourceDirectory, { recursive: true });
  await writeFile(sourcePath, options.content);
  const file: LoadedResourceFile = {
    source: 'payload.md',
    sourcePath,
    destination: options.destination,
    ...(options.managed ? { onExisting: 'managed-prepend-once' as const } : {}),
  };

  return {
    schemaVersion: 1,
    id: options.id,
    name: options.id,
    description: options.id,
    kind: options.kind,
    directoryPath: resourceDirectory,
    files: [file],
  };
}

function operation(
  targetRoot: string,
  name: string,
  kind: InstallationOperationKind,
  nextContent?: string,
): InstallationOperation {
  return {
    resourceId: name,
    sourcePath: path.join(targetRoot, 'catalog', `${name}.md`),
    destinationPath: path.join(targetRoot, 'target', `${name}.md`),
    kind,
    ...(nextContent === undefined ? {} : { nextContent }),
    template: false,
  };
}

function plan(
  targetRoot: string,
  operations: InstallationOperation[],
  hasBlockingConflicts = false,
): InstallationPlan {
  return {
    targetRoot: path.join(targetRoot, 'target'),
    operations,
    hasReplacementConflicts: operations.some(
      (item) => item.kind === 'replace-conflict',
    ),
    hasBlockingConflicts,
  };
}

describe('applyInstallationPlan', () => {
  it('rejects a blocking plan before invoking the writer', async () => {
    await withTempDirectory(async (directory) => {
      await mkdir(path.join(directory, 'target'));
      let calls = 0;
      const writer: FileWriter = {
        async writeAtomically() {
          calls += 1;
        },
      };
      const blockedOperation = operation(
        directory,
        'agents',
        'malformed-markers-conflict',
      );

      await expect(
        applyInstallationPlan(
          plan(directory, [blockedOperation], true),
          writer,
        ),
      ).rejects.toThrow('Cannot apply a plan with blocking conflicts');
      expect(calls).toBe(0);
    });
  });

  it('writes actionable operations and skips informational operations', async () => {
    await withTempDirectory(async (directory) => {
      const targetRoot = path.join(directory, 'target');
      await mkdir(targetRoot);
      await writeFile(path.join(targetRoot, 'prepend.md'), 'Old prepend\n');
      await writeFile(path.join(targetRoot, 'replace.md'), 'Old replace\n');
      const operations = [
        operation(directory, 'create', 'create', 'Created\n'),
        operation(directory, 'prepend', 'prepend', 'Prepended\n'),
        operation(directory, 'replace', 'replace-conflict', 'Replaced\n'),
        operation(directory, 'same', 'unchanged'),
        operation(directory, 'installed', 'already-installed'),
      ];

      const result = await applyInstallationPlan(plan(directory, operations));

      expect(result).toEqual({
        status: 'completed',
        completed: operations.slice(0, 3),
      });
      await expect(
        readFile(path.join(targetRoot, 'create.md'), 'utf8'),
      ).resolves.toBe('Created\n');
      await expect(
        readFile(path.join(targetRoot, 'prepend.md'), 'utf8'),
      ).resolves.toBe('Prepended\n');
      await expect(
        readFile(path.join(targetRoot, 'replace.md'), 'utf8'),
      ).resolves.toBe('Replaced\n');
    });
  });

  it('creates missing parent directories for a planned write', async () => {
    await withTempDirectory(async (directory) => {
      const targetRoot = path.join(directory, 'target');
      await mkdir(targetRoot);
      const create = operation(directory, 'nested', 'create', 'Nested\n');
      create.destinationPath = path.join(targetRoot, 'docs/guides/nested.md');

      const result = await applyInstallationPlan(plan(directory, [create]));

      expect(result.status).toBe('completed');
      await expect(readFile(create.destinationPath, 'utf8')).resolves.toBe(
        'Nested\n',
      );
    });
  });

  it('reports completed and failed operations precisely', async () => {
    await withTempDirectory(async (directory) => {
      const targetRoot = path.join(directory, 'target');
      await mkdir(targetRoot);
      const first = operation(directory, 'first', 'create', 'First\n');
      const second = operation(directory, 'second', 'create', 'Second\n');
      const failure = new Error('forced writer failure');
      const writer: FileWriter = {
        async writeAtomically(destinationPath, content) {
          if (destinationPath === second.destinationPath) {
            throw failure;
          }
          await mkdir(path.dirname(destinationPath), { recursive: true });
          await writeFile(destinationPath, content);
        },
      };

      const result = await applyInstallationPlan(
        plan(directory, [first, second]),
        writer,
      );

      expect(result).toEqual({
        status: 'failed',
        completed: [first],
        failed: second,
        error: failure,
      });
    });
  });

  it('removes its explicit temporary sibling when atomic rename fails', async () => {
    await withTempDirectory(async (directory) => {
      const targetRoot = path.join(directory, 'target');
      const conflictingDirectory = path.join(targetRoot, 'conflict.md');
      await mkdir(conflictingDirectory, { recursive: true });
      const create = operation(directory, 'conflict', 'create', 'Content\n');

      const result = await applyInstallationPlan(plan(directory, [create]));

      expect(result).toMatchObject({
        status: 'failed',
        failed: create,
      });
      expect(await readdir(targetRoot)).toEqual(['conflict.md']);
    });
  });
});

describe('planner and executor lifecycle', () => {
  it('installs a standalone guide into missing nested directories', async () => {
    await withTempDirectory(async (directory) => {
      const targetRoot = path.join(directory, 'target');
      await mkdir(targetRoot);
      const resource = await loadedResource(directory, {
        id: 'frontend-project-structure',
        kind: 'guide',
        content: '# Frontend guide\n',
        destination: 'docs/project-guides/frontend-project-structure.md',
      });

      const installationPlan = await planInstallation([resource], targetRoot);
      const result = await applyInstallationPlan(installationPlan);

      expect(result.status).toBe('completed');
      await expect(
        readFile(
          path.join(
            targetRoot,
            'docs/project-guides/frontend-project-structure.md',
          ),
          'utf8',
        ),
      ).resolves.toBe('# Frontend guide\n');
    });
  });

  it('prepends an agent guide while preserving existing content below it', async () => {
    await withTempDirectory(async (directory) => {
      const targetRoot = path.join(directory, 'target');
      await mkdir(targetRoot);
      const destinationPath = path.join(targetRoot, 'AGENTS.md');
      await writeFile(destinationPath, '# Existing instructions\n');
      const resource = await loadedResource(directory, {
        id: 'agents-project-guide',
        kind: 'template',
        content: '## Findings\n',
        destination: 'AGENTS.md',
        managed: true,
      });

      const installationPlan = await planInstallation([resource], targetRoot);
      await applyInstallationPlan(installationPlan);

      expect(await readFile(destinationPath, 'utf8')).toBe(
        `${wrapManagedBlock(
          'agents-project-guide',
          '## Findings\n',
        )}\n# Existing instructions\n`,
      );
    });
  });

  it('preserves edits inside an installed agent block on rerun', async () => {
    await withTempDirectory(async (directory) => {
      const targetRoot = path.join(directory, 'target');
      await mkdir(targetRoot);
      const destinationPath = path.join(targetRoot, 'AGENTS.md');
      const resource = await loadedResource(directory, {
        id: 'agents-project-guide',
        kind: 'template',
        content: 'Original findings\n',
        destination: 'AGENTS.md',
        managed: true,
      });
      await applyInstallationPlan(
        await planInstallation([resource], targetRoot),
      );
      const edited = (await readFile(destinationPath, 'utf8')).replace(
        'Original findings',
        'User-edited findings',
      );
      await writeFile(destinationPath, edited);

      const rerunPlan = await planInstallation([resource], targetRoot);
      const rerunResult = await applyInstallationPlan(rerunPlan);

      expect(rerunPlan.operations[0]?.kind).toBe('already-installed');
      expect(rerunResult).toEqual({ status: 'completed', completed: [] });
      expect(await readFile(destinationPath, 'utf8')).toBe(edited);
    });
  });

  it('does not replace standalone conflicting content until the plan is applied', async () => {
    await withTempDirectory(async (directory) => {
      const targetRoot = path.join(directory, 'target');
      await mkdir(path.join(targetRoot, 'docs'), { recursive: true });
      const destinationPath = path.join(targetRoot, 'docs/guide.md');
      await writeFile(destinationPath, 'Existing content\n');
      const resource = await loadedResource(directory, {
        id: 'replacement-guide',
        kind: 'guide',
        content: 'Replacement content\n',
        destination: 'docs/guide.md',
      });

      const installationPlan = await planInstallation([resource], targetRoot);

      expect(installationPlan.operations[0]?.kind).toBe('replace-conflict');
      expect(await readFile(destinationPath, 'utf8')).toBe(
        'Existing content\n',
      );

      await applyInstallationPlan(installationPlan);
      expect(await readFile(destinationPath, 'utf8')).toBe(
        'Replacement content\n',
      );
    });
  });
});
