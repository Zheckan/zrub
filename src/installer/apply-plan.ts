import { mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { assertSafeDestination } from './destination.js';
import type {
  ExecutionResult,
  InstallationOperation,
  InstallationPlan,
} from './types.js';

export interface FileWriter {
  writeAtomically(destinationPath: string, content: string): Promise<void>;
}

function isMissingPath(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
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
  async writeAtomically(destinationPath, content) {
    const parentDirectory = path.dirname(destinationPath);
    await mkdir(parentDirectory, { recursive: true });

    const temporaryPath = path.join(
      parentDirectory,
      `.${path.basename(destinationPath)}.project-blueprints-${process.pid}-${randomUUID()}.tmp`,
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

function isWritable(operation: InstallationOperation): boolean {
  return (
    operation.kind === 'create' ||
    operation.kind === 'prepend' ||
    operation.kind === 'replace-conflict'
  );
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export async function applyInstallationPlan(
  plan: InstallationPlan,
  writer: FileWriter = atomicFileWriter,
): Promise<ExecutionResult> {
  if (plan.hasBlockingConflicts) {
    throw new Error('Cannot apply a plan with blocking conflicts');
  }

  const completed: InstallationOperation[] = [];
  for (const operation of plan.operations) {
    if (!isWritable(operation)) {
      continue;
    }

    try {
      if (operation.nextContent === undefined) {
        throw new Error(
          `Writable operation is missing next content: ${operation.resourceId}`,
        );
      }
      await assertSafeDestination(plan.targetRoot, operation.destinationPath);
      await writer.writeAtomically(
        operation.destinationPath,
        operation.nextContent,
      );
      completed.push(operation);
    } catch (error) {
      return {
        status: 'failed',
        completed,
        failed: operation,
        error: asError(error),
      };
    }
  }

  return { status: 'completed', completed };
}
