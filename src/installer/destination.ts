import { lstat } from 'node:fs/promises';
import path from 'node:path';

import type { LoadedResourceFile } from '../catalog/types.js';
import { isMissingPath } from '../errors.js';

function relativeWithin(targetRoot: string, destinationPath: string): string {
  const relative = path.relative(targetRoot, destinationPath);
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      `Unsafe destination outside target project: ${destinationPath}`,
    );
  }
  return relative;
}

export function resolveDestination(
  targetRoot: string,
  file: LoadedResourceFile,
): string {
  if (
    path.isAbsolute(file.destination) ||
    file.destination.includes('\\') ||
    file.destination.includes('\0') ||
    file.destination.split('/').includes('..')
  ) {
    throw new Error(`Unsafe destination: ${file.destination}`);
  }

  const relativeDestination = file.destination.endsWith('/')
    ? path.posix.join(file.destination, path.posix.basename(file.source))
    : file.destination;
  const resolvedTargetRoot = path.resolve(targetRoot);
  const resolvedDestination = path.resolve(
    resolvedTargetRoot,
    relativeDestination,
  );

  relativeWithin(resolvedTargetRoot, resolvedDestination);
  return resolvedDestination;
}

export async function assertSafeDestination(
  targetRoot: string,
  destinationPath: string,
): Promise<void> {
  const resolvedTargetRoot = path.resolve(targetRoot);
  const resolvedDestination = path.resolve(destinationPath);
  const relative = relativeWithin(resolvedTargetRoot, resolvedDestination);
  const segments = relative === '' ? [] : relative.split(path.sep);
  const pathsToInspect = [resolvedTargetRoot];

  let currentPath = resolvedTargetRoot;
  for (const segment of segments) {
    currentPath = path.join(currentPath, segment);
    pathsToInspect.push(currentPath);
  }

  for (const [index, inspectedPath] of pathsToInspect.entries()) {
    try {
      const stats = await lstat(inspectedPath);
      if (stats.isSymbolicLink()) {
        throw new Error(`Symbolic links are not allowed: ${inspectedPath}`);
      }

      const isFinalPath = index === pathsToInspect.length - 1;
      if (!isFinalPath && !stats.isDirectory()) {
        throw new Error(
          `Destination ancestor must be a directory: ${inspectedPath}`,
        );
      }
    } catch (error) {
      if (isMissingPath(error)) {
        return;
      }
      throw error;
    }
  }
}
