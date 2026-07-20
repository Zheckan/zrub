import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  applyInstallationPlan,
  type FileWriter,
} from '../../src/installer/apply-plan.js';
import type {
  InstallationOperation,
  InstallationOperationKind,
  InstallationPlan,
} from '../../src/installer/types.js';
import { withTempDirectory } from '../helpers/temp-project.js';

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
