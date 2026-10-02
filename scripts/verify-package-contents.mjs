import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const requiredEntries = [
  'package/package.json',
  'package/README.md',
  'package/LICENSE',
  'package/dist/cli.js',
  'package/resources/frontend-project-structure/resource.json',
  'package/resources/frontend-project-structure/frontend-project-structure.md',
  'package/resources/agents-project-guide/resource.json',
  'package/resources/agents-project-guide/AGENTS.md',
];
const excludedPrefixes = [
  'package/src/',
  'package/tests/',
  'package/docs/',
  'package/scripts/',
  'package/.github/',
];

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    ...options,
  });

  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${arguments_.join(' ')} failed with exit code ${result.status}\n${result.stdout}${result.stderr}`,
    );
  }

  return result.stdout;
}

const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'zrub-package-'));

try {
  run('pnpm', ['pack', '--json', '--pack-destination', temporaryDirectory]);

  const tarballs = (await readdir(temporaryDirectory)).filter((entry) =>
    entry.endsWith('.tgz'),
  );
  assert.equal(tarballs.length, 1, 'expected exactly one packed tarball');

  const tarballPath = path.join(temporaryDirectory, tarballs[0]);
  const entries = run('tar', ['-tzf', tarballPath])
    .split('\n')
    .filter(Boolean)
    .map((entry) => entry.replace(/^\.\//, ''));

  for (const requiredEntry of requiredEntries) {
    assert.ok(
      entries.includes(requiredEntry),
      `missing package entry: ${requiredEntry}`,
    );
  }
  for (const excludedPrefix of excludedPrefixes) {
    assert.ok(
      entries.every((entry) => !entry.startsWith(excludedPrefix)),
      `unexpected package entry under: ${excludedPrefix}`,
    );
  }

  const packedPackage = JSON.parse(
    run('tar', ['-xOf', tarballPath, 'package/package.json']),
  );
  assert.equal(packedPackage.name, 'zrub');
  assert.deepEqual(packedPackage.bin, {
    zrub: 'dist/cli.js',
  });
  assert.equal(packedPackage.engines?.node, '>=22');

  process.stdout.write('Packed package contents are valid.\n');
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
