import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { asError, isMissingPath } from '../errors.js';
import { assertSafeDestination } from './destination.js';
import {
  hashBytes,
  MANIFEST_FILE,
  MUTATION_LOCK,
  readManifest,
  readTarget,
  serializeManifest,
  setMapping,
} from './manifest.js';
import type {
  ExecutionResult,
  InstallationOperation,
  InstallationPlan,
} from './types.js';

export interface FileWriter {
  writeAtomically(
    destinationPath: string,
    content: string | Buffer,
  ): Promise<void>;
  deleteFile(destinationPath: string): Promise<void>;
}

async function removeTemporaryFile(temporaryPath: string): Promise<void> {
  try {
    await unlink(temporaryPath);
  } catch (error) {
    if (!isMissingPath(error)) {
      throw error;
    }
  }
}

export const atomicFileWriter: FileWriter = {
  deleteFile: unlink,
  async writeAtomically(destinationPath, content) {
    const parentDirectory = path.dirname(destinationPath);
    await mkdir(parentDirectory, { recursive: true });

    const temporaryPath = path.join(
      parentDirectory,
      `.${path.basename(destinationPath)}.zrub-${process.pid}-${randomUUID()}.tmp`,
    );
    let handle;

    try {
      handle = await open(temporaryPath, 'wx', 0o666);
      await handle.writeFile(content, 'utf8');
      await handle.close();
      handle = undefined;
      await rename(temporaryPath, destinationPath);
    } catch (error) {
      if (handle !== undefined) {
        await handle.close();
      }
      await removeTemporaryFile(temporaryPath);
      throw error;
    }
  },
};

export async function applyInstallationPlan(
  plan: InstallationPlan,
  writer: FileWriter = atomicFileWriter,
): Promise<ExecutionResult> {
  if (plan.hasBlockingConflicts) {
    throw new Error('Cannot apply a plan with blocking conflicts');
  }

  if (
    plan.operations.some(
      (operation) => operation.kind === 'local-edit-conflict',
    )
  )
    throw new Error('Choose how to handle local edits before applying');
  const actionable = plan.operations.filter(
    (operation) =>
      'mapping' in operation ||
      operation.kind === 'delete' ||
      operation.kind === 'forget',
  );
  if (!actionable.length) return { status: 'completed', completed: [] };
  const lockPath = path.join(plan.targetRoot, MUTATION_LOCK);
  await assertSafeDestination(plan.targetRoot, lockPath);
  let lock;
  try {
    lock = await open(lockPath, 'wx', 0o600);
  } catch (error) {
    throw new Error(
      `Cannot acquire ${MUTATION_LOCK}. Another operation or an interrupted run owns it; verify no Zrub process is running before removing it. ${asError(error).message}`,
    );
  }
  const lockStat = await lock.stat();
  try {
    let manifest = plan.manifest.manifest;
    let manifestHash = plan.manifest.hash;
    if ((await readManifest(plan.targetRoot)).hash !== manifestHash)
      throw new Error('Manifest changed since review; run Zrub again.');
    const checked = new Set<string>();
    for (const operation of plan.operations) {
      if (checked.has(operation.destinationPath)) continue;
      checked.add(operation.destinationPath);
      const content = await readTarget(
        plan.targetRoot,
        operation.destinationPath,
      );
      if (
        (content === null ? null : hashBytes(content)) !==
        operation.expectedHash
      )
        throw new Error(
          `File changed since review: ${operation.destinationPath}`,
        );
    }
    const completed: InstallationOperation[] = [];
    for (const operation of plan.operations) {
      if (!actionable.includes(operation)) {
        continue;
      }

      let phase: 'payload' | 'checkpoint' | 'precondition' = 'precondition';
      let payloadChanged = false;
      try {
        const current = await readTarget(
          plan.targetRoot,
          operation.destinationPath,
        );
        if (
          (current === null ? null : hashBytes(current)) !==
            operation.expectedHash ||
          (await readManifest(plan.targetRoot)).hash !== manifestHash
        )
          throw new Error(
            `Reviewed state changed: ${operation.destinationPath}`,
          );
        phase = 'payload';
        if ('nextContent' in operation) {
          await writer.writeAtomically(
            operation.destinationPath,
            operation.nextContent,
          );
          payloadChanged = true;
        } else if (operation.kind === 'delete') {
          await writer.deleteFile(operation.destinationPath);
          payloadChanged = true;
        }
        // shortcut: payload and tracking commit separately, add a journal when interrupted runs need automatic recovery.
        phase = 'checkpoint';
        const destination = path
          .relative(plan.targetRoot, operation.destinationPath)
          .split(path.sep)
          .join('/');
        const nextManifest = setMapping(
          manifest,
          operation.resourceId,
          destination,
          'mapping' in operation ? operation.mapping : null,
        );
        const serialized = serializeManifest(nextManifest);
        if (
          serialized !== serializeManifest(manifest) ||
          manifestHash === null
        ) {
          const manifestPath = path.join(plan.targetRoot, MANIFEST_FILE);
          await assertSafeDestination(plan.targetRoot, manifestPath);
          if ((await readManifest(plan.targetRoot)).hash !== manifestHash)
            throw new Error('Manifest changed during execution');
          await writer.writeAtomically(manifestPath, serialized);
          manifestHash = hashBytes(serialized);
        }
        manifest = nextManifest;
        completed.push(operation);
      } catch (error) {
        return {
          status: 'failed',
          phase,
          completed,
          untracked: payloadChanged ? [operation] : [],
          failed: operation,
          error: asError(error),
        };
      }
    }

    return { status: 'completed', completed };
  } finally {
    await lock.close();
    try {
      const currentLock = await lstat(lockPath);
      if (currentLock.dev === lockStat.dev && currentLock.ino === lockStat.ino)
        await unlink(lockPath);
    } catch (error) {
      if (!isMissingPath(error)) throw error;
    }
  }
}
