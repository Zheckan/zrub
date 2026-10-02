import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { isMissingPath } from '../errors.js';
import type {
  LoadedResource,
  LoadedResourceFile,
  ResourceDefinition,
} from './types.js';
import { validateResourceDefinition } from './validate-resource.js';

async function readDefinition(
  resourceDirectory: string,
): Promise<ResourceDefinition> {
  const metadataPath = path.join(resourceDirectory, 'resource.json');
  let source: string;

  try {
    source = await readFile(metadataPath, 'utf8');
  } catch (error) {
    if (isMissingPath(error)) {
      throw new Error(`Missing resource metadata: ${metadataPath}`);
    }
    throw error;
  }

  let input: unknown;
  try {
    input = JSON.parse(source) as unknown;
  } catch (error) {
    throw new Error(`Unable to parse resource metadata: ${metadataPath}`, {
      cause: error,
    });
  }

  return validateResourceDefinition(input);
}

async function resolvePayloads(
  resourceDirectory: string,
  definition: ResourceDefinition,
): Promise<LoadedResourceFile[]> {
  return Promise.all(
    definition.files.map(async (file) => {
      const sourcePath = path.resolve(resourceDirectory, file.source);
      const relative = path.relative(resourceDirectory, sourcePath);

      if (
        relative === '..' ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      ) {
        throw new Error(`Payload escapes resource directory: ${file.source}`);
      }

      const stats = await lstat(sourcePath).catch((error: unknown) => {
        if (isMissingPath(error)) {
          throw new Error(`Payload not found: ${sourcePath}`);
        }
        throw error;
      });
      if (!stats.isFile()) {
        throw new Error(`Payload must be a regular file: ${sourcePath}`);
      }

      return { ...file, sourcePath };
    }),
  );
}

export async function loadCatalog(
  resourcesRoot: string,
): Promise<LoadedResource[]> {
  const directoryEntries = await readdir(resourcesRoot, {
    withFileTypes: true,
  });
  const resourceDirectories = directoryEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(resourcesRoot, entry.name));
  const resources: LoadedResource[] = [];
  const resourceIds = new Set<string>();

  for (const resourceDirectory of resourceDirectories) {
    const definition = await readDefinition(resourceDirectory);
    if (resourceIds.has(definition.id)) {
      throw new Error(`Duplicate resource id: ${definition.id}`);
    }

    resourceIds.add(definition.id);
    resources.push({
      ...definition,
      directoryPath: resourceDirectory,
      files: await resolvePayloads(resourceDirectory, definition),
    });
  }

  return resources.sort((left, right) => left.id.localeCompare(right.id));
}
