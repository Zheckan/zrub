import { mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { LoadedResourceFile } from '../../src/catalog/types.js';
import {
  assertSafeDestination,
  resolveDestination,
} from '../../src/installer/destination.js';
import { withTempDirectory } from '../helpers/temp-project.js';

function resourceFile(destination: string): LoadedResourceFile {
  return {
    source: 'nested/guide.md',
    sourcePath: '/catalog/resource/nested/guide.md',
    destination,
  };
}

describe('resolveDestination', () => {
  it('resolves an exact destination filename', () => {
    expect(
      resolveDestination('/project', resourceFile('docs/frontend.md')),
    ).toBe(path.resolve('/project/docs/frontend.md'));
  });

  it('preserves the source basename for a directory destination', () => {
    expect(resolveDestination('/project', resourceFile('docs/guides/'))).toBe(
      path.resolve('/project/docs/guides/guide.md'),
    );
  });

  it.each(['/absolute.md', '../outside.md', 'docs/../../outside.md'])(
    'rejects unsafe metadata destination %s',
    (destination) => {
      expect(() =>
        resolveDestination('/project', resourceFile(destination)),
      ).toThrow(/Unsafe destination/);
    },
  );

  it('rejects sibling-prefix escapes', () => {
    expect(() =>
      resolveDestination('/tmp/app', resourceFile('../application/file.md')),
    ).toThrow(/Unsafe destination/);
  });
});

describe('assertSafeDestination', () => {
  it('accepts regular existing segments and missing descendants', async () => {
    await withTempDirectory(async (targetRoot) => {
      await mkdir(path.join(targetRoot, 'docs'));

      await expect(
        assertSafeDestination(
          targetRoot,
          path.join(targetRoot, 'docs/new/guide.md'),
        ),
      ).resolves.toBeUndefined();
    });
  });

  it('rejects a symbolic-link target root', async () => {
    await withTempDirectory(async (directory) => {
      const realRoot = path.join(directory, 'real');
      const linkedRoot = path.join(directory, 'linked');
      await mkdir(realRoot);
      await symlink(realRoot, linkedRoot);

      await expect(
        assertSafeDestination(linkedRoot, path.join(linkedRoot, 'guide.md')),
      ).rejects.toThrow(/Symbolic links are not allowed/);
    });
  });

  it('rejects a symbolic-link ancestor below the target root', async () => {
    await withTempDirectory(async (targetRoot) => {
      const outside = path.join(targetRoot, 'outside');
      await mkdir(outside);
      await symlink(outside, path.join(targetRoot, 'docs'));

      await expect(
        assertSafeDestination(
          targetRoot,
          path.join(targetRoot, 'docs/guide.md'),
        ),
      ).rejects.toThrow(/Symbolic links are not allowed/);
    });
  });

  it('rejects a symbolic-link destination', async () => {
    await withTempDirectory(async (targetRoot) => {
      const realFile = path.join(targetRoot, 'real.md');
      const linkedFile = path.join(targetRoot, 'guide.md');
      await writeFile(realFile, '# Real\n');
      await symlink(realFile, linkedFile);

      await expect(
        assertSafeDestination(targetRoot, linkedFile),
      ).rejects.toThrow(/Symbolic links are not allowed/);
    });
  });

  it('rejects a destination outside the target root', async () => {
    await withTempDirectory(async (targetRoot) => {
      await expect(
        assertSafeDestination(
          targetRoot,
          path.resolve(targetRoot, '../outside.md'),
        ),
      ).rejects.toThrow(/outside target project/);
    });
  });
});
