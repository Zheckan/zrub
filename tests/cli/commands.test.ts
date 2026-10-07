import { spawnSync } from 'node:child_process';
import {
  cp,
  mkdir,
  readdir,
  readFile,
  symlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { withTempDirectory } from '../helpers/temp-project.js';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const cliPath = path.join(repositoryRoot, 'dist/cli.js');

beforeAll(() => {
  const build = spawnSync('pnpm', ['build'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (build.status !== 0) {
    throw new Error(`CLI test build failed: ${build.stdout}${build.stderr}`);
  }
}, 30_000);

function runCommand(args: string[], cwd: string, entryPoint = cliPath) {
  return spawnSync(process.execPath, [entryPoint, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 10_000,
  });
}

describe('public CLI commands', () => {
  it('keeps interactive installation as the no-argument default', async () => {
    await withTempDirectory(async (targetRoot) => {
      const result = spawnSync(process.execPath, [cliPath], {
        cwd: targetRoot,
        encoding: 'utf8',
        input: '\r',
        timeout: 10_000,
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Select resources to install');
      expect(result.stdout).toContain('No resources selected.');
      expect(await readdir(targetRoot)).toEqual([]);
    });
  });

  it.each(['guide', 'prompt', 'template', 'example', 'code'])(
    'reads %s resources and emits each distinct source once',
    async (kind) => {
      await withTempDirectory(async (temporaryRoot) => {
        const appRoot = path.join(temporaryRoot, 'app');
        const resourceRoot = path.join(appRoot, 'resources/sample-resource');
        const targetRoot = path.join(temporaryRoot, 'project');
        await mkdir(path.join(resourceRoot, 'nested'), { recursive: true });
        await mkdir(targetRoot);
        await cp(
          path.join(repositoryRoot, 'dist'),
          path.join(appRoot, 'dist'),
          {
            recursive: true,
          },
        );
        await writeFile(
          path.join(appRoot, 'package.json'),
          '{"type":"module"}',
        );
        await writeFile(
          path.join(resourceRoot, 'guide.md'),
          '# Instructions\r\nKeep café.\r\n',
        );
        await writeFile(
          path.join(resourceRoot, 'nested/example.yml'),
          'name: example\n',
        );
        await writeFile(
          path.join(resourceRoot, 'resource.json'),
          JSON.stringify({
            schemaVersion: 1,
            id: 'sample-resource',
            name: 'Sample resource',
            description: 'Reusable instructions.',
            kind,
            files: [
              { source: 'guide.md', destination: 'docs/guide.md' },
              { source: 'guide.md', destination: 'docs/another-guide.md' },
              { source: 'nested/example.yml', destination: 'example.yml' },
            ],
          }),
        );

        const result = runCommand(
          ['read', 'sample-resource', '--json'],
          targetRoot,
          path.join(appRoot, 'dist/cli.js'),
        );

        expect(result.status).toBe(0);
        expect(result.stderr).toBe('');
        expect(JSON.parse(result.stdout)).toEqual({
          id: 'sample-resource',
          name: 'Sample resource',
          description: 'Reusable instructions.',
          kind,
          files: [
            { source: 'guide.md', content: '# Instructions\r\nKeep café.\r\n' },
            { source: 'nested/example.yml', content: 'name: example\n' },
          ],
        });
        expect(await readdir(targetRoot)).toEqual([]);
      });
    },
  );

  it('rejects symlinked metadata before exposing its contents', async () => {
    await withTempDirectory(async (temporaryRoot) => {
      const appRoot = path.join(temporaryRoot, 'app');
      const resourceRoot = path.join(appRoot, 'resources/linked-metadata');
      const targetRoot = path.join(temporaryRoot, 'project');
      await mkdir(resourceRoot, { recursive: true });
      await mkdir(targetRoot);
      await cp(path.join(repositoryRoot, 'dist'), path.join(appRoot, 'dist'), {
        recursive: true,
      });
      await writeFile(path.join(appRoot, 'package.json'), '{"type":"module"}');
      const metadataPath = path.join(temporaryRoot, 'outside.json');
      await writeFile(
        metadataPath,
        JSON.stringify({
          schemaVersion: 1,
          id: 'linked-metadata',
          name: 'Outside metadata',
          description: 'OUTSIDE_METADATA_SENTINEL',
          kind: 'guide',
          files: [{ source: 'guide.md', destination: 'docs/guide.md' }],
        }),
      );
      await writeFile(path.join(resourceRoot, 'guide.md'), '# Guide\n');
      await symlink(metadataPath, path.join(resourceRoot, 'resource.json'));

      const result = runCommand(
        ['list', '--json'],
        targetRoot,
        path.join(appRoot, 'dist/cli.js'),
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain(
        'Resource metadata must be a regular file',
      );
      expect(result.stderr).not.toContain('OUTSIDE_METADATA_SENTINEL');
      expect(await readdir(targetRoot)).toEqual([]);
    });
  });

  it('reads bundled instructions outside the checkout without loading the interactive UI', async () => {
    await withTempDirectory(async (temporaryRoot) => {
      const appRoot = path.join(temporaryRoot, 'app');
      const targetRoot = path.join(temporaryRoot, 'project');
      await mkdir(targetRoot);
      await cp(path.join(repositoryRoot, 'dist'), path.join(appRoot, 'dist'), {
        recursive: true,
      });
      await cp(
        path.join(repositoryRoot, 'resources'),
        path.join(appRoot, 'resources'),
        {
          recursive: true,
        },
      );
      await writeFile(path.join(appRoot, 'package.json'), '{"type":"module"}');

      const result = runCommand(
        ['read', 'typescript-ci-setup', '--json'],
        targetRoot,
        path.join(appRoot, 'dist/cli.js'),
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toMatchObject({
        id: 'typescript-ci-setup',
      });
      expect(await readdir(targetRoot)).toEqual([]);
    });
  });

  it('refuses instructions reached through a directory symlink outside their resource', async () => {
    await withTempDirectory(async (temporaryRoot) => {
      const appRoot = path.join(temporaryRoot, 'app');
      const resourceRoot = path.join(appRoot, 'resources/unsafe-guide');
      const outsideRoot = path.join(temporaryRoot, 'outside');
      const targetRoot = path.join(temporaryRoot, 'project');
      await mkdir(resourceRoot, { recursive: true });
      await mkdir(outsideRoot);
      await mkdir(targetRoot);
      await cp(path.join(repositoryRoot, 'dist'), path.join(appRoot, 'dist'), {
        recursive: true,
      });
      await writeFile(path.join(appRoot, 'package.json'), '{"type":"module"}');
      await symlink(
        path.join(repositoryRoot, 'node_modules'),
        path.join(appRoot, 'node_modules'),
      );
      await writeFile(
        path.join(outsideRoot, 'guide.md'),
        'OUTSIDE_PAYLOAD_SENTINEL',
      );
      await symlink(outsideRoot, path.join(resourceRoot, 'nested'));
      await writeFile(
        path.join(resourceRoot, 'resource.json'),
        JSON.stringify({
          schemaVersion: 1,
          id: 'unsafe-guide',
          name: 'Unsafe guide',
          description: 'A test resource with an escaping source.',
          kind: 'guide',
          files: [{ source: 'nested/guide.md', destination: 'docs/guide.md' }],
        }),
      );

      const result = runCommand(
        ['read', 'unsafe-guide', '--json'],
        targetRoot,
        path.join(appRoot, 'dist/cli.js'),
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Payload escapes resource directory');
      expect(result.stderr).not.toContain('OUTSIDE_PAYLOAD_SENTINEL');
      expect(await readdir(targetRoot)).toEqual([]);
    });
  });

  it('includes every template source and preserves each file content', async () => {
    await withTempDirectory(async (targetRoot) => {
      const result = runCommand(
        ['read', 'agents-project-guide', '--json'],
        targetRoot,
      );
      expect(result.status).toBe(0);
      const resource: unknown = JSON.parse(result.stdout);
      const sources = [
        'AGENTS.md',
        'AGENTS.existing.md',
        'findings.md',
        'zrub.md',
      ];
      const expectedFiles = await Promise.all(
        sources.map(async (source) => ({
          source,
          content: await readFile(
            path.join(repositoryRoot, 'resources/agents-project-guide', source),
            'utf8',
          ),
        })),
      );
      expect(resource).toMatchObject({ files: expectedFiles });
      expect(await readdir(targetRoot)).toEqual([]);
    });
  });

  it.each([
    ['read'],
    ['read', 'typescript-ci-setup', '--unknown'],
    ['read', 'typescript-ci-setup', '--json', '--json'],
    ['list', '--unknown'],
    ['list', 'unexpected'],
    ['--json'],
    ['unknown-command'],
    ['--help', 'unexpected'],
  ])(
    'rejects invalid arguments %j without invoking installation',
    async (...args) => {
      await withTempDirectory(async (targetRoot) => {
        const result = runCommand(args, targetRoot);
        expect(result.status).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('Use zrub --help');
        expect(await readdir(targetRoot)).toEqual([]);
      });
    },
  );

  it('reports an unknown resource on stderr with no partial output', async () => {
    await withTempDirectory(async (targetRoot) => {
      const result = runCommand(
        ['read', 'missing-resource', '--json'],
        targetRoot,
      );
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Unknown resource: missing-resource');
      expect(await readdir(targetRoot)).toEqual([]);
    });
  });

  it('explains one-time agent usage without opening the installer', async () => {
    await withTempDirectory(async (targetRoot) => {
      const result = runCommand(['--help'], targetRoot);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('zrub list [--json]');
      expect(result.stdout).toContain('zrub read <resource-id> [--json]');
      expect(result.stdout).toContain('follow the instructions');
      expect(result.stdout).not.toContain('Select resources to install');
      expect(await readdir(targetRoot)).toEqual([]);
    });
  });

  it('lists resource IDs and descriptions as readable text', async () => {
    await withTempDirectory(async (targetRoot) => {
      const result = runCommand(['list'], targetRoot);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('typescript-ci-setup');
      expect(result.stdout).toContain('TypeScript CI setup');
      expect(result.stdout).toContain('separate and consolidated checks');
      expect(result.stdout).toContain('typescript-ci-setup.md');
      expect(result.stdout).not.toContain('\u001b[');
      expect(await readdir(targetRoot)).toEqual([]);
    });
  });

  it('prints readable GitHub setup instructions with file names', async () => {
    await withTempDirectory(async (targetRoot) => {
      const result = runCommand(
        ['read', 'github-repo-setup-profile'],
        targetRoot,
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('GitHub repository setup profile');
      expect(result.stdout).toContain('Resource ID: github-repo-setup-profile');
      expect(result.stdout).toContain(
        '## Source: github-repo-setup-profile.md',
      );
      expect(result.stdout).toContain('## 1. General repository settings');
      expect(result.stdout).not.toContain('\u001b[');
      expect(await readdir(targetRoot)).toEqual([]);
    });
  });

  it('returns CI instructions as JSON without installing or executing them', async () => {
    await withTempDirectory(async (targetRoot) => {
      await writeFile(path.join(targetRoot, 'AGENTS.md'), '# Keep my notes\n');
      const expectedContent = await readFile(
        path.join(
          repositoryRoot,
          'resources/typescript-ci-setup/typescript-ci-setup.md',
        ),
        'utf8',
      );

      const result = runCommand(
        ['read', 'typescript-ci-setup', '--json'],
        targetRoot,
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toEqual({
        id: 'typescript-ci-setup',
        name: 'TypeScript CI setup',
        description: expect.any(String),
        kind: 'guide',
        files: [{ source: 'typescript-ci-setup.md', content: expectedContent }],
      });
      expect(await readdir(targetRoot)).toEqual(['AGENTS.md']);
      expect(await readFile(path.join(targetRoot, 'AGENTS.md'), 'utf8')).toBe(
        '# Keep my notes\n',
      );
    });
  });

  it('lists discoverable resources as JSON without changing the project', async () => {
    await withTempDirectory(async (targetRoot) => {
      await writeFile(path.join(targetRoot, 'AGENTS.md'), '# My project\n');

      const result = runCommand(['list', '--json'], targetRoot);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toEqual([
        {
          id: 'agents-project-guide',
          name: 'Agent project guide',
          description: expect.any(String),
          kind: 'template',
          files: ['AGENTS.md', 'AGENTS.existing.md', 'findings.md', 'zrub.md'],
        },
        {
          id: 'frontend-project-structure',
          name: 'Frontend project structure',
          description: expect.any(String),
          kind: 'guide',
          files: ['frontend-project-structure.md'],
        },
        {
          id: 'github-repo-setup-profile',
          name: 'GitHub repository setup profile',
          description: expect.any(String),
          kind: 'guide',
          files: ['github-repo-setup-profile.md'],
        },
        {
          id: 'typescript-ci-setup',
          name: 'TypeScript CI setup',
          description: expect.any(String),
          kind: 'guide',
          files: ['typescript-ci-setup.md'],
        },
      ]);
      expect(await readdir(targetRoot)).toEqual(['AGENTS.md']);
      expect(await readFile(path.join(targetRoot, 'AGENTS.md'), 'utf8')).toBe(
        '# My project\n',
      );
    });
  });
});
