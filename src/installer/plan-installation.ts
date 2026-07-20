import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { LoadedResource, LoadedResourceFile } from '../catalog/types.js';
import { assertSafeDestination, resolveDestination } from './destination.js';
import { inspectManagedBlock, wrapManagedBlock } from './managed-block.js';
import type { InstallationOperation, InstallationPlan } from './types.js';

function isMissingPath(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function operationBase(
  resource: LoadedResource,
  file: LoadedResourceFile,
  destinationPath: string,
): Omit<InstallationOperation, 'kind'> {
  return {
    resourceId: resource.id,
    sourcePath: file.sourcePath,
    destinationPath,
    template: resource.kind === 'template',
  };
}

async function destinationExists(destinationPath: string): Promise<boolean> {
  try {
    const stats = await lstat(destinationPath);
    if (!stats.isFile()) {
      throw new Error(
        `Installation destination must be a regular file: ${destinationPath}`,
      );
    }
    return true;
  } catch (error) {
    if (isMissingPath(error)) {
      return false;
    }
    throw error;
  }
}

async function planFile(
  resource: LoadedResource,
  file: LoadedResourceFile,
  targetRoot: string,
): Promise<InstallationOperation> {
  const destinationPath = resolveDestination(targetRoot, file);
  await assertSafeDestination(targetRoot, destinationPath);

  const sourceContent = await readFile(file.sourcePath, 'utf8');
  const base = operationBase(resource, file, destinationPath);
  if (!(await destinationExists(destinationPath))) {
    return {
      ...base,
      kind: 'create',
      nextContent:
        file.onExisting === 'managed-prepend-once'
          ? wrapManagedBlock(resource.id, sourceContent)
          : sourceContent,
    };
  }

  const existingContent = await readFile(destinationPath, 'utf8');
  if (file.onExisting === 'managed-prepend-once') {
    const managedState = inspectManagedBlock(resource.id, existingContent);
    if (managedState.kind === 'installed') {
      return { ...base, kind: 'already-installed' };
    }
    if (managedState.kind === 'malformed') {
      return {
        ...base,
        kind: 'malformed-markers-conflict',
        conflictReason: managedState.reason,
      };
    }

    return {
      ...base,
      kind: 'prepend',
      nextContent: `${wrapManagedBlock(resource.id, sourceContent)}\n${existingContent}`,
    };
  }

  if (existingContent === sourceContent) {
    return { ...base, kind: 'unchanged' };
  }

  return {
    ...base,
    kind: 'replace-conflict',
    nextContent: sourceContent,
  };
}

export async function planInstallation(
  resources: LoadedResource[],
  targetRoot: string,
): Promise<InstallationPlan> {
  const resolvedTargetRoot = path.resolve(targetRoot);
  const operations: InstallationOperation[] = [];

  for (const resource of resources) {
    for (const file of resource.files) {
      operations.push(await planFile(resource, file, resolvedTargetRoot));
    }
  }

  return {
    targetRoot: resolvedTargetRoot,
    operations,
    hasReplacementConflicts: operations.some(
      (operation) => operation.kind === 'replace-conflict',
    ),
    hasBlockingConflicts: operations.some(
      (operation) => operation.kind === 'malformed-markers-conflict',
    ),
  };
}
