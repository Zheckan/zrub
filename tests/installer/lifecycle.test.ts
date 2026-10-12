import {
  mkdir,
  readFile,
  readdir,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { LoadedResource } from '../../src/catalog/types.js';
import {
  applyInstallationPlan,
  atomicFileWriter,
} from '../../src/installer/apply-plan.js';
import {
  choosePlanOperation,
  planInstallation,
} from '../../src/installer/plan-installation.js';
import { inspectInstallation } from '../../src/installer/status.js';
import { withTempDirectory } from '../helpers/temp-project.js';

const release = { name: '@zheckan/zrub', version: '0.2.0' };

async function fixture(directory: string, content = 'hello\n') {
  const targetRoot = path.join(directory, 'project');
  const directoryPath = path.join(directory, 'catalog/guide');
  await mkdir(targetRoot, { recursive: true });
  await mkdir(directoryPath, { recursive: true });
  const sourcePath = path.join(directoryPath, 'guide.md');
  await writeFile(sourcePath, content);
  const resource: LoadedResource = {
    schemaVersion: 1,
    id: 'guide',
    name: 'Guide',
    description: 'A guide',
    kind: 'guide',
    directoryPath,
    files: [{ source: 'guide.md', sourcePath, destination: 'guide.md' }],
  };
  return { targetRoot, resource, sourcePath };
}

describe('resource lifecycle', () => {
  it('reinstalls a missing block using its known full template rather than inferring a minimal variant', async () => {
    await withTempDirectory(async (directory) => {
      const { targetRoot, resource } = await fixture(
        directory,
        'full template\n',
      );
      const alternate = path.join(resource.directoryPath, 'existing.md');
      await writeFile(alternate, 'minimal template\n');
      resource.files[0]!.onExisting = 'managed-prepend-once';
      resource.files[0]!.existingSource = 'existing.md';
      resource.files[0]!.existingSourcePath = alternate;
      await applyInstallationPlan(
        await planInstallation([resource], targetRoot, { release }),
      );
      await writeFile(path.join(targetRoot, 'guide.md'), '');
      await applyInstallationPlan(
        await planInstallation([resource], targetRoot, { release }),
      );
      expect(await readFile(path.join(targetRoot, 'guide.md'), 'utf8')).toBe(
        '<!-- zrub:guide:start -->\nfull template\n<!-- zrub:guide:end -->\n\n',
      );
    });
  });

  it('serializes concurrent mutations so only one reviewed plan can run', async () => {
    await withTempDirectory(async (directory) => {
      const { targetRoot, resource } = await fixture(directory);
      const plan = await planInstallation([resource], targetRoot, { release });
      let resume!: () => void;
      let started!: () => void;
      const waiting = new Promise<void>((resolve) => {
        resume = resolve;
      });
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      const first = applyInstallationPlan(plan, {
        ...atomicFileWriter,
        async writeAtomically(destination, content) {
          if (destination.endsWith('guide.md')) {
            started();
            await waiting;
          }
          await atomicFileWriter.writeAtomically(destination, content);
        },
      });
      await entered;
      try {
        await expect(applyInstallationPlan(plan)).rejects.toThrow(
          'Cannot acquire',
        );
      } finally {
        resume();
      }
      expect((await first).status).toBe('completed');
      expect(await readFile(path.join(targetRoot, 'guide.md'), 'utf8')).toBe(
        'hello\n',
      );
      expect(await inspectInstallation([resource], targetRoot)).toMatchObject({
        resources: [{ files: [{ local: 'unchanged' }] }],
      });
      expect(await readdir(targetRoot)).toEqual(['guide.md', 'zrub-lock.json']);
    });
  });

  it('records mixed release versions after a partial update and preserves no-op baselines', async () => {
    await withTempDirectory(async (directory) => {
      const { targetRoot, resource, sourcePath } = await fixture(directory);
      resource.files.push({
        source: 'guide.md',
        sourcePath,
        destination: 'second.md',
      });
      await applyInstallationPlan(
        await planInstallation([resource], targetRoot, { release }),
      );
      const before = await readFile(
        path.join(targetRoot, 'zrub-lock.json'),
        'utf8',
      );
      const updatedRelease = { ...release, version: '0.3.0' };
      await applyInstallationPlan(
        await planInstallation([resource], targetRoot, {
          intent: 'update',
          release: updatedRelease,
        }),
      );
      expect(
        await readFile(path.join(targetRoot, 'zrub-lock.json'), 'utf8'),
      ).toBe(before);
      await writeFile(sourcePath, 'new version\n');
      const update = await planInstallation([resource], targetRoot, {
        intent: 'update',
        release: updatedRelease,
      });
      const result = await applyInstallationPlan(update, {
        ...atomicFileWriter,
        async writeAtomically(destination, content) {
          if (destination.endsWith('second.md'))
            throw new Error('payload denied');
          await atomicFileWriter.writeAtomically(destination, content);
        },
      });
      expect(result).toMatchObject({
        status: 'failed',
        phase: 'payload',
        completed: [{ destinationPath: path.join(targetRoot, 'guide.md') }],
      });
      expect(await inspectInstallation([resource], targetRoot)).toMatchObject({
        resources: [
          {
            files: [
              { source: { package: updatedRelease }, catalog: 'unchanged' },
              { source: { package: release }, catalog: 'changed' },
            ],
          },
        ],
      });
      expect(await readFile(path.join(targetRoot, 'second.md'), 'utf8')).toBe(
        'hello\n',
      );
    });
  });

  it('blocks policy changes on ordinary reinstall and restores the recorded source variant', async () => {
    await withTempDirectory(async (directory) => {
      const { targetRoot, resource } = await fixture(
        directory,
        'full template\n',
      );
      const alternate = path.join(resource.directoryPath, 'existing.md');
      await writeFile(alternate, 'minimal template\n');
      resource.files[0]!.onExisting = 'managed-prepend-once';
      resource.files[0]!.existingSource = 'existing.md';
      resource.files[0]!.existingSourcePath = alternate;
      await writeFile(
        path.join(targetRoot, 'guide.md'),
        'project instructions\n',
      );
      await applyInstallationPlan(
        await planInstallation([resource], targetRoot, { release }),
      );
      const original = await readFile(path.join(targetRoot, 'guide.md'));
      delete resource.files[0]!.onExisting;
      const changed = await planInstallation([resource], targetRoot, {
        release,
      });
      expect(changed.hasBlockingConflicts).toBe(true);
      expect(await readFile(path.join(targetRoot, 'guide.md'))).toEqual(
        original,
      );
      resource.files[0]!.onExisting = 'managed-prepend-once';
      await unlink(path.join(targetRoot, 'guide.md'));
      await applyInstallationPlan(
        await planInstallation([resource], targetRoot, { release }),
      );
      expect(await readFile(path.join(targetRoot, 'guide.md'), 'utf8')).toBe(
        '<!-- zrub:guide:start -->\nminimal template\n<!-- zrub:guide:end -->\n',
      );
    });
  });

  it('preserves known template variants and observes existing blocks without inventing provenance', async () => {
    await withTempDirectory(async (directory) => {
      const { targetRoot, resource } = await fixture(
        directory,
        'full template\n',
      );
      const alternate = path.join(resource.directoryPath, 'existing.md');
      await writeFile(alternate, 'minimal template\n');
      resource.files[0]!.onExisting = 'managed-prepend-once';
      resource.files[0]!.existingSource = 'existing.md';
      resource.files[0]!.existingSourcePath = alternate;
      await writeFile(
        path.join(targetRoot, 'guide.md'),
        'project instructions\n',
      );
      await applyInstallationPlan(
        await planInstallation([resource], targetRoot, { release }),
      );
      expect(await inspectInstallation([resource], targetRoot)).toMatchObject({
        resources: [
          {
            files: [
              {
                source: { kind: 'known', file: 'existing.md' },
                local: 'unchanged',
                catalog: 'unchanged',
              },
            ],
          },
        ],
      });
      const installed = await readFile(path.join(targetRoot, 'guide.md'));
      await unlink(path.join(targetRoot, 'zrub-lock.json'));
      const observed = await planInstallation([resource], targetRoot, {
        release,
      });
      expect(observed.operations[0]).toMatchObject({
        kind: 'track',
        mapping: {
          provenance: 'observed-existing',
          source: { kind: 'unknown' },
        },
      });
      await applyInstallationPlan(observed);
      expect(await readFile(path.join(targetRoot, 'guide.md'))).toEqual(
        installed,
      );
      expect(await inspectInstallation([resource], targetRoot)).toMatchObject({
        resources: [{ files: [{ catalog: 'unknown-baseline' }] }],
      });
      const removal = await planInstallation([resource], targetRoot, {
        intent: 'remove',
        resourceIds: ['guide'],
      });
      await applyInstallationPlan(choosePlanOperation(removal, 0, 'forget'));
      expect(await readFile(path.join(targetRoot, 'guide.md'))).toEqual(
        installed,
      );
    });
  });

  it('installs multiple distinct blocks in one file without overwriting earlier blocks', async () => {
    await withTempDirectory(async (directory) => {
      const { targetRoot, resource } = await fixture(directory);
      resource.files[0]!.onExisting = 'managed-prepend-once';
      const second = { ...resource, id: 'other-guide' };
      const plan = await planInstallation([resource, second], targetRoot, {
        release,
      });
      expect((await applyInstallationPlan(plan)).status).toBe('completed');
      expect(await readFile(path.join(targetRoot, 'guide.md'), 'utf8')).toBe(
        '<!-- zrub:other-guide:start -->\nhello\n<!-- zrub:other-guide:end -->\n\n<!-- zrub:guide:start -->\nhello\n<!-- zrub:guide:end -->\n',
      );
      const status = await inspectInstallation([resource, second], targetRoot);
      expect(status.resources.map((item) => item.files[0]?.local)).toEqual([
        'unchanged',
        'unchanged',
      ]);
    });
  });

  it('adopts matching standalone files without making them eligible for deletion', async () => {
    await withTempDirectory(async (directory) => {
      const { targetRoot, resource } = await fixture(directory);
      await writeFile(path.join(targetRoot, 'guide.md'), 'hello\n');
      await applyInstallationPlan(
        await planInstallation([resource], targetRoot, { release }),
      );
      const removal = await planInstallation([resource], targetRoot, {
        intent: 'remove',
        resourceIds: ['guide'],
      });
      expect(removal.operations[0]).toMatchObject({ kind: 'retain' });
      expect((await applyInstallationPlan(removal)).status).toBe('completed');
      expect(await inspectInstallation([resource], targetRoot)).toMatchObject({
        resources: [
          { files: [{ provenance: 'observed-existing', local: 'unchanged' }] },
        ],
      });
      expect(await readFile(path.join(targetRoot, 'guide.md'), 'utf8')).toBe(
        'hello\n',
      );
    });
  });

  it.each([
    '../outside.md',
    '/outside.md',
    'C:\\outside.md',
    'docs/../outside.md',
    'zrub-lock.json',
    '.zrub-mutation.lock',
    'docs//guide.md',
  ])(
    'rejects unsafe recorded destination %s without modifying files',
    async (destination) => {
      await withTempDirectory(async (directory) => {
        const { targetRoot, resource } = await fixture(directory);
        await applyInstallationPlan(
          await planInstallation([resource], targetRoot, { release }),
        );
        const manifestPath = path.join(targetRoot, 'zrub-lock.json');
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
        manifest.resources.guide[0].destination = destination;
        const invalid = JSON.stringify(manifest);
        await writeFile(manifestPath, invalid);
        await expect(
          inspectInstallation([resource], targetRoot),
        ).rejects.toThrow(/Unsafe|Reserved/);
        expect(await readFile(manifestPath, 'utf8')).toBe(invalid);
        expect(await readFile(path.join(targetRoot, 'guide.md'), 'utf8')).toBe(
          'hello\n',
        );
      });
    },
  );

  it('rejects malformed versions, hashes, ownership conflicts, and symlinked tracked paths', async () => {
    await withTempDirectory(async (directory) => {
      const { targetRoot, resource } = await fixture(directory);
      await applyInstallationPlan(
        await planInstallation([resource], targetRoot, { release }),
      );
      const manifestPath = path.join(targetRoot, 'zrub-lock.json');
      const original = await readFile(manifestPath, 'utf8');
      await writeFile(manifestPath, '{broken');
      await expect(inspectInstallation([resource], targetRoot)).rejects.toThrow(
        'Invalid zrub-lock.json',
      );
      for (const alter of [
        (manifest: Record<string, unknown>) => {
          manifest.schemaVersion = 2;
        },
        (manifest: {
          resources: Record<string, Array<{ baselineHash: string }>>;
        }) => {
          manifest.resources.guide![0]!.baselineHash = 'invalid';
        },
        (manifest: { resources: Record<string, unknown> }) => {
          manifest.resources.other = manifest.resources.guide;
        },
      ]) {
        const manifest = JSON.parse(original);
        alter(manifest);
        await writeFile(manifestPath, JSON.stringify(manifest));
        await expect(planInstallation([resource], targetRoot)).rejects.toThrow(
          'Invalid zrub-lock.json',
        );
      }
      await writeFile(manifestPath, original);
      await unlink(path.join(targetRoot, 'guide.md'));
      const outside = path.join(directory, 'outside.md');
      await writeFile(outside, 'outside content\n');
      await symlink(outside, path.join(targetRoot, 'guide.md'));
      await expect(inspectInstallation([resource], targetRoot)).rejects.toThrow(
        'Symbolic links',
      );
      expect(await readFile(outside, 'utf8')).toBe('outside content\n');
    });
  });

  it('rejects stale files and manifests before writing and does not break existing locks', async () => {
    await withTempDirectory(async (directory) => {
      const { targetRoot, resource } = await fixture(directory);
      const plan = await planInstallation([resource], targetRoot, { release });
      await writeFile(
        path.join(targetRoot, 'guide.md'),
        'appeared during review\n',
      );
      await expect(applyInstallationPlan(plan)).rejects.toThrow(
        'changed since review',
      );
      expect(await readdir(targetRoot)).toEqual(['guide.md']);
      expect(await readFile(path.join(targetRoot, 'guide.md'), 'utf8')).toBe(
        'appeared during review\n',
      );
      await unlink(path.join(targetRoot, 'guide.md'));
      await writeFile(
        path.join(targetRoot, 'zrub-lock.json'),
        '{"schemaVersion":1,"resources":{}}',
      );
      await expect(applyInstallationPlan(plan)).rejects.toThrow(
        'Manifest changed',
      );
      await unlink(path.join(targetRoot, 'zrub-lock.json'));
      await writeFile(
        path.join(targetRoot, '.zrub-mutation.lock'),
        'another operation',
      );
      await expect(applyInstallationPlan(plan)).rejects.toThrow(
        'Cannot acquire',
      );
      expect(
        await readFile(path.join(targetRoot, '.zrub-mutation.lock'), 'utf8'),
      ).toBe('another operation');
    });
  });

  it('reports a payload that succeeded without its checkpoint and stops later writes', async () => {
    await withTempDirectory(async (directory) => {
      const { targetRoot, resource, sourcePath } = await fixture(directory);
      resource.files.push({
        source: 'guide.md',
        sourcePath,
        destination: 'second.md',
      });
      const plan = await planInstallation([resource], targetRoot, { release });
      const result = await applyInstallationPlan(plan, {
        ...atomicFileWriter,
        async writeAtomically(destination, content) {
          if (destination.endsWith('zrub-lock.json'))
            throw new Error('checkpoint denied');
          await atomicFileWriter.writeAtomically(destination, content);
        },
      });
      expect(result).toMatchObject({
        status: 'failed',
        phase: 'checkpoint',
        completed: [],
        untracked: [{ destinationPath: path.join(targetRoot, 'guide.md') }],
      });
      expect(await readFile(path.join(targetRoot, 'guide.md'), 'utf8')).toBe(
        'hello\n',
      );
      expect(await readdir(targetRoot)).toEqual(['guide.md']);
      const retry = await planInstallation([resource], targetRoot, { release });
      expect(retry.operations[0]).toMatchObject({
        kind: 'track',
        mapping: { provenance: 'observed-existing' },
      });
    });
  });

  it('keeps completed checkpoints when a later file changes during execution', async () => {
    await withTempDirectory(async (directory) => {
      const { targetRoot, resource, sourcePath } = await fixture(directory);
      resource.files.push({
        source: 'guide.md',
        sourcePath,
        destination: 'second.md',
      });
      const plan = await planInstallation([resource], targetRoot, { release });
      const result = await applyInstallationPlan(plan, {
        ...atomicFileWriter,
        async writeAtomically(destination, content) {
          await atomicFileWriter.writeAtomically(destination, content);
          if (destination.endsWith('zrub-lock.json'))
            await writeFile(
              path.join(targetRoot, 'second.md'),
              'concurrent notes\n',
            );
        },
      });
      expect(result).toMatchObject({
        status: 'failed',
        phase: 'precondition',
        completed: [{ destinationPath: path.join(targetRoot, 'guide.md') }],
        untracked: [],
      });
      expect(await readFile(path.join(targetRoot, 'second.md'), 'utf8')).toBe(
        'concurrent notes\n',
      );
      expect(await inspectInstallation([resource], targetRoot)).toMatchObject({
        resources: [
          { files: [{ destination: 'guide.md', local: 'unchanged' }] },
        ],
      });
    });
  });

  it('blocks changed mapping policies and keeps missing and unavailable records explicit', async () => {
    await withTempDirectory(async (directory) => {
      const { targetRoot, resource } = await fixture(directory);
      await applyInstallationPlan(
        await planInstallation([resource], targetRoot, { release }),
      );
      resource.files[0]!.destination = 'moved.md';
      const migration = await planInstallation([resource], targetRoot, {
        intent: 'update',
      });
      expect(migration).toMatchObject({
        hasBlockingConflicts: true,
        operations: [{ kind: 'migration-conflict' }],
      });
      await expect(applyInstallationPlan(migration)).rejects.toThrow(
        'blocking',
      );
      expect(await readFile(path.join(targetRoot, 'guide.md'), 'utf8')).toBe(
        'hello\n',
      );
      await unlink(path.join(targetRoot, 'guide.md'));
      expect(await inspectInstallation([], targetRoot)).toMatchObject({
        resources: [{ files: [{ local: 'missing', catalog: 'unavailable' }] }],
      });
      resource.files[0]!.destination = 'guide.md';
      expect(
        (await planInstallation([resource], targetRoot, { intent: 'update' }))
          .operations[0],
      ).toMatchObject({ kind: 'create' });
      await expect(
        planInstallation([resource], targetRoot, {
          intent: 'remove',
          resourceIds: ['guide', 'unknown'],
        }),
      ).rejects.toThrow('not tracked');
      const removal = await planInstallation([], targetRoot, {
        intent: 'remove',
        resourceIds: ['guide'],
      });
      expect(removal.operations[0]).toMatchObject({ kind: 'forget' });
      expect((await applyInstallationPlan(removal)).status).toBe('completed');
      expect(await inspectInstallation([], targetRoot)).toEqual({
        resources: [],
      });
    });
  });

  it('copies exact payload bytes and preserves managed bytes outside the block', async () => {
    await withTempDirectory(async (directory) => {
      const { targetRoot, resource, sourcePath } = await fixture(directory);
      const payload = Buffer.from([0x61, 0xff, 0x0d, 0x0a]);
      await writeFile(sourcePath, payload);
      resource.files[0]!.onExisting = 'managed-prepend-once';
      const outside = Buffer.from([0x23, 0xfe, 0x0d, 0x0a]);
      await writeFile(path.join(targetRoot, 'guide.md'), outside);
      await applyInstallationPlan(
        await planInstallation([resource], targetRoot, { release }),
      );
      const installed = await readFile(path.join(targetRoot, 'guide.md'));
      expect(installed).toEqual(
        Buffer.concat([
          Buffer.from('<!-- zrub:guide:start -->\n'),
          payload,
          Buffer.from('<!-- zrub:guide:end -->\n\n'),
          outside,
        ]),
      );
      await writeFile(sourcePath, 'upstream changes\n');
      const update = await planInstallation([resource], targetRoot, {
        intent: 'update',
      });
      expect(update.operations[0]).toMatchObject({ kind: 'retain' });
      expect((await applyInstallationPlan(update)).status).toBe('completed');
      expect(await readFile(path.join(targetRoot, 'guide.md'))).toEqual(
        installed,
      );
      expect(await inspectInstallation([resource], targetRoot)).toMatchObject({
        resources: [{ files: [{ local: 'unchanged', catalog: 'changed' }] }],
      });
    });
  });

  it('removes only written, unchanged files and lets users forget retained edits', async () => {
    await withTempDirectory(async (directory) => {
      const { targetRoot, resource } = await fixture(directory);
      await applyInstallationPlan(
        await planInstallation([resource], targetRoot, { release }),
      );
      await expect(
        planInstallation([resource], targetRoot, { intent: 'remove' }),
      ).rejects.toThrow('Select resource IDs');
      await writeFile(path.join(targetRoot, 'guide.md'), 'keep my edits\n');
      const retained = await planInstallation([resource], targetRoot, {
        intent: 'remove',
        resourceIds: ['guide'],
      });
      expect(retained.operations[0]).toMatchObject({ kind: 'retain' });
      expect((await applyInstallationPlan(retained)).status).toBe('completed');
      expect(
        (await inspectInstallation([resource], targetRoot)).resources[0]?.id,
      ).toBe('guide');
      await applyInstallationPlan(choosePlanOperation(retained, 0, 'forget'));
      expect(await readFile(path.join(targetRoot, 'guide.md'), 'utf8')).toBe(
        'keep my edits\n',
      );
      expect(await inspectInstallation([resource], targetRoot)).toEqual({
        resources: [],
      });
      await unlink(path.join(targetRoot, 'guide.md'));
      await applyInstallationPlan(
        await planInstallation([resource], targetRoot, { release }),
      );
      const removal = await planInstallation([], targetRoot, {
        intent: 'remove',
        resourceIds: ['guide'],
      });
      expect(removal.operations[0]).toMatchObject({ kind: 'delete' });
      expect((await applyInstallationPlan(removal)).status).toBe('completed');
      expect(await readdir(targetRoot)).toEqual(['zrub-lock.json']);
    });
  });

  it('leaves records and files intact when deletion fails', async () => {
    await withTempDirectory(async (directory) => {
      const { targetRoot, resource } = await fixture(directory);
      await applyInstallationPlan(
        await planInstallation([resource], targetRoot, { release }),
      );
      const before = await readFile(
        path.join(targetRoot, 'zrub-lock.json'),
        'utf8',
      );
      const plan = await planInstallation([resource], targetRoot, {
        intent: 'remove',
        resourceIds: ['guide'],
      });
      const writer = {
        ...atomicFileWriter,
        async deleteFile() {
          throw new Error('deletion denied');
        },
      };
      const result = await applyInstallationPlan(plan, writer);
      expect(result).toMatchObject({
        status: 'failed',
        phase: 'payload',
        untracked: [],
        error: new Error('deletion denied'),
      });
      expect(await readFile(path.join(targetRoot, 'guide.md'), 'utf8')).toBe(
        'hello\n',
      );
      expect(
        await readFile(path.join(targetRoot, 'zrub-lock.json'), 'utf8'),
      ).toBe(before);
    });
  });

  it('updates a clean baseline and requires a choice before replacing local edits', async () => {
    await withTempDirectory(async (directory) => {
      const { targetRoot, resource, sourcePath } = await fixture(directory);
      await applyInstallationPlan(
        await planInstallation([resource], targetRoot, { release }),
      );
      await writeFile(sourcePath, 'new guide\n');
      const updatedRelease = { ...release, version: '0.3.0' };
      const update = await planInstallation([resource], targetRoot, {
        intent: 'update',
        release: updatedRelease,
      });
      expect(update.operations[0]).toMatchObject({ kind: 'update' });
      expect((await applyInstallationPlan(update)).status).toBe('completed');
      expect(await readFile(path.join(targetRoot, 'guide.md'), 'utf8')).toBe(
        'new guide\n',
      );
      await writeFile(path.join(targetRoot, 'guide.md'), 'my notes\n');
      const conflicted = await planInstallation([resource], targetRoot, {
        intent: 'update',
        release: updatedRelease,
      });
      expect(conflicted.operations[0]).toMatchObject({
        kind: 'local-edit-conflict',
        conflictReason: expect.stringContaining('Local edits'),
      });
      await expect(applyInstallationPlan(conflicted)).rejects.toThrow('Choose');
      expect(await readFile(path.join(targetRoot, 'guide.md'), 'utf8')).toBe(
        'my notes\n',
      );
    });
  });

  it('records a written baseline and reports local edits without changing tracking', async () => {
    await withTempDirectory(async (directory) => {
      const { targetRoot, resource } = await fixture(directory);
      const plan = await planInstallation([resource], targetRoot, { release });
      expect(await readdir(targetRoot)).toEqual([]);
      expect((await applyInstallationPlan(plan)).status).toBe('completed');
      const manifestPath = path.join(targetRoot, 'zrub-lock.json');
      const before = await readFile(manifestPath, 'utf8');
      expect(JSON.parse(before)).toMatchObject({
        schemaVersion: 1,
        resources: {
          guide: [
            {
              destination: 'guide.md',
              ownership: 'file',
              provenance: 'written',
              baselineHash:
                '5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03',
              source: { kind: 'known', file: 'guide.md', package: release },
            },
          ],
        },
      });
      await writeFile(path.join(targetRoot, 'guide.md'), 'my notes\n');
      expect(await inspectInstallation([resource], targetRoot)).toMatchObject({
        resources: [
          { id: 'guide', files: [{ local: 'modified', catalog: 'unchanged' }] },
        ],
      });
      expect(await readFile(manifestPath, 'utf8')).toBe(before);
      expect(await readFile(path.join(targetRoot, 'guide.md'), 'utf8')).toBe(
        'my notes\n',
      );
    });
  });
});
