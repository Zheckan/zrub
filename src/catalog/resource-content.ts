import { readFile } from 'node:fs/promises';

import { resolvePayloadPath } from './load-catalog.js';
import type { LoadedResource } from './types.js';

export function describeResource(resource: LoadedResource) {
  return {
    id: resource.id,
    name: resource.name,
    description: resource.description,
    kind: resource.kind,
    files: [
      ...new Set(
        resource.files.flatMap((file) =>
          file.existingSource === undefined
            ? [file.source]
            : [file.source, file.existingSource],
        ),
      ),
    ],
  };
}

export async function readResource(resource: LoadedResource) {
  const summary = describeResource(resource);
  const files = await Promise.all(
    summary.files.map(async (source) => ({
      source,
      content: await readFile(
        await resolvePayloadPath(resource.directoryPath, source),
        'utf8',
      ),
    })),
  );

  return { ...summary, files };
}
