import path from 'node:path';
import { hashBytes } from '../../src/installer/manifest.js';
import type {
  InstallationOperation,
  InstallationOperationKind,
} from '../../src/installer/types.js';

export function operationFixture(options: {
  targetRoot: string;
  resourceId: string;
  kind: InstallationOperationKind;
  destination?: string;
  content?: string;
  current?: string | null;
  template?: boolean;
  conflictReason?: string;
}): InstallationOperation {
  const destination = options.destination ?? `${options.resourceId}.md`;
  const base = {
    resourceId: options.resourceId,
    sourcePath: `/catalog/${options.resourceId}.md`,
    destinationPath: path.join(options.targetRoot, destination),
    expectedHash: options.current == null ? null : hashBytes(options.current),
    template: options.template ?? false,
    ...(options.conflictReason === undefined
      ? {}
      : { conflictReason: options.conflictReason }),
  };
  const content = options.content ?? 'content\n';
  const mapping = {
    destination,
    ownership: 'file' as const,
    provenance: 'written' as const,
    baselineHash: hashBytes(content),
    source: {
      kind: 'known' as const,
      file: `${options.resourceId}.md`,
      package: { name: '@zheckan/zrub', version: '0.2.0' },
      hash: hashBytes(content),
    },
  };
  if (options.kind === 'track') return { ...base, kind: options.kind, mapping };
  if (
    options.kind === 'create' ||
    options.kind === 'prepend' ||
    options.kind === 'replace-conflict' ||
    options.kind === 'update' ||
    options.kind === 'local-edit-conflict'
  )
    return { ...base, kind: options.kind, mapping, nextContent: content };
  return { ...base, kind: options.kind };
}
export function emptyManifest() {
  return { hash: null, manifest: { schemaVersion: 1 as const, resources: {} } };
}
