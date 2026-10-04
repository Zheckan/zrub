import { fileURLToPath } from 'node:url';

export function bundledResourcesRoot(metaUrl = import.meta.url): string {
  return fileURLToPath(new URL('../../resources/', metaUrl));
}
