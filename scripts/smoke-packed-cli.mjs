import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const localBin = path.join(repositoryRoot, 'node_modules', '.bin');

async function run(command, arguments_, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 30_000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal, stdout, stderr, timedOut });
    });

    child.stdin.end(options.input);
  });
}

function formatFailure(launcher, command, arguments_, result) {
  return [
    `${launcher} launcher smoke failed`,
    `command: ${command} ${arguments_.join(' ')}`,
    `exit code: ${String(result.code)}`,
    `signal: ${String(result.signal)}`,
    `timed out: ${String(result.timedOut)}`,
    `stdout:\n${result.stdout}`,
    `stderr:\n${result.stderr}`,
  ].join('\n');
}

async function assertMissing(filePath) {
  try {
    await access(filePath);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  throw new Error(`launcher unexpectedly installed: ${filePath}`);
}

const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'zrub-launchers-'));

try {
  const packDirectory = path.join(temporaryRoot, 'pack');
  await mkdir(packDirectory);
  const packResult = await run(
    'pnpm',
    ['pack', '--pack-destination', packDirectory],
    {
      cwd: repositoryRoot,
      env: process.env,
      input: '',
    },
  );
  assert.equal(
    packResult.code,
    0,
    formatFailure('pack', 'pnpm', ['pack'], packResult),
  );

  const tarballs = (await readdir(packDirectory)).filter((entry) =>
    entry.endsWith('.tgz'),
  );
  assert.equal(tarballs.length, 1, 'expected exactly one packed tarball');
  const tarballPath = path.join(packDirectory, tarballs[0]);
  const launchers = [
    ['npx', 'npx', ['--yes', '--package', tarballPath, 'zrub']],
    ['pnpm dlx', 'pnpm', ['dlx', tarballPath]],
    ['yarn dlx', 'yarn', ['dlx', '--package', tarballPath, 'zrub']],
    ['bunx', 'bunx', ['--package', tarballPath, 'zrub']],
  ];
  const launcherEnvironment = {
    ...process.env,
    PATH: `${localBin}${path.delimiter}${process.env.PATH ?? ''}`,
  };

  for (const [launcher, command, arguments_] of launchers) {
    const targetDirectory = path.join(
      temporaryRoot,
      launcher.replaceAll(' ', '-'),
    );
    await mkdir(targetDirectory);
    const result = await run(command, arguments_, {
      cwd: targetDirectory,
      env: launcherEnvironment,
      // Clack treats carriage return as Enter; a newline is not sufficient.
      input: '\r',
    });
    const failure = formatFailure(launcher, command, arguments_, result);

    assert.equal(result.code, 0, failure);
    assert.match(result.stdout, /Zrub/, failure);
    assert.match(result.stdout, /No resources selected\./, failure);
    await assertMissing(path.join(targetDirectory, 'AGENTS.md'));
    await assertMissing(path.join(targetDirectory, 'docs', 'project-guides'));

    process.stdout.write(`${launcher}: passed\n`);
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
