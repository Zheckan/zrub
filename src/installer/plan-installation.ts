import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { LoadedResource, LoadedResourceFile } from '../catalog/types.js';
import { isMissingPath } from '../errors.js';
import { assertSafeDestination, resolveDestination } from './destination.js';
import { inspectManagedBlock, wrapManagedBlock } from './managed-block.js';
import type { InstallationOperation, InstallationPlan } from './types.js';

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
  const base = operationBase(resource, file, destinationPath);
  const managed = file.onExisting === 'managed-prepend-once';

  if (!(await destinationExists(destinationPath))) {
    const sourceContent = await readFile(file.sourcePath, 'utf8');
    return {
      ...base,
      kind: 'create',
      nextContent: managed
        ? wrapManagedBlock(resource.id, sourceContent)
        : sourceContent,
    };
  }

  const existingContent = await readFile(destinationPath, 'utf8');
  if (managed) {
    const payloadPath = file.existingSourcePath ?? file.sourcePath;
    const payloadContent = await readFile(payloadPath, 'utf8');
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
      nextContent: `${wrapManagedBlock(resource.id, payloadContent)}\n${existingContent}`,
    };
  }

  const sourceContent = await readFile(file.sourcePath, 'utf8');
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
