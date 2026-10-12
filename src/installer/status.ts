import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { LoadedResource, LoadedResourceFile } from '../catalog/types.js';
import { resolveDestination } from './destination.js';
import {
  blockBytes,
  hashBytes,
  readManifest,
  readTarget,
  type InstalledMapping,
} from './manifest.js';
export function matchingFile(
  resource: LoadedResource,
  mapping: InstalledMapping,
  targetRoot: string,
): LoadedResourceFile | undefined {
  return resource.files.find(
    (file) =>
      path
        .relative(targetRoot, resolveDestination(targetRoot, file))
        .split(path.sep)
        .join('/') === mapping.destination &&
      (file.onExisting === 'managed-prepend-once'
        ? 'managed-block'
        : 'file') === mapping.ownership &&
      (mapping.source.kind === 'unknown' ||
        file.source === mapping.source.file ||
        file.existingSource === mapping.source.file),
  );
}
export async function inspectMapping(
  resourceId: string,
  mapping: InstalledMapping,
  resource: LoadedResource | undefined,
  targetRoot: string,
  content: Buffer | null,
) {
  let local: 'unchanged' | 'modified' | 'missing' | 'malformed-block' =
    'missing';
  if (content !== null) {
    try {
      const bytes =
        mapping.ownership === 'file'
          ? content
          : blockBytes(resourceId, content);
      local =
        bytes === null
          ? 'missing'
          : hashBytes(bytes) === mapping.baselineHash
            ? 'unchanged'
            : 'modified';
    } catch {
      local = 'malformed-block';
    }
  }
  let catalog: 'unchanged' | 'changed' | 'unknown-baseline' | 'unavailable' =
    'unavailable';
  if (resource !== undefined) {
    const file = matchingFile(resource, mapping, targetRoot);
    if (file === undefined) catalog = 'changed';
    else if (mapping.source.kind === 'unknown') catalog = 'unknown-baseline';
    else {
      const sourcePath =
        file.existingSource === mapping.source.file
          ? file.existingSourcePath
          : file.sourcePath;
      if (sourcePath === undefined)
        throw new Error(`Missing source for ${resourceId}`);
      catalog =
        hashBytes(await readFile(sourcePath)) === mapping.source.hash
          ? 'unchanged'
          : 'changed';
    }
  }
  return {
    destination: mapping.destination,
    ownership: mapping.ownership,
    provenance: mapping.provenance,
    source: mapping.source,
    local,
    catalog,
  };
}
export async function inspectInstallation(
  resources: LoadedResource[],
  targetRoot: string,
) {
  const { manifest } = await readManifest(targetRoot);
  const result = [];
  for (const [id, mappings] of Object.entries(manifest.resources).sort(
    ([a], [b]) => a.localeCompare(b),
  )) {
    const resource = resources.find((item) => item.id === id);
    const files = [];
    for (const mapping of [...mappings].sort((a, b) =>
      a.destination.localeCompare(b.destination),
    ))
      files.push(
        await inspectMapping(
          id,
          mapping,
          resource,
          targetRoot,
          await readTarget(
            targetRoot,
            path.join(targetRoot, mapping.destination),
          ),
        ),
      );
    const catalogMappings =
      resource === undefined
        ? 'unavailable'
        : resource.files.length !== mappings.length ||
            mappings.some(
              (mapping) =>
                matchingFile(resource, mapping, targetRoot) === undefined,
            )
          ? 'changed'
          : 'unchanged';
    result.push({ id, catalogMappings, files });
  }
  return { resources: result };
}
