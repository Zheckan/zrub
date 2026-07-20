import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export async function withTempDirectory(
  run: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'project-blueprints-test-'),
  );

  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
