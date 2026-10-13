import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { isMissingPath } from '../errors.js';
import { assertSafeDestination } from './destination.js';
import { inspectManagedBlock } from './managed-block.js';

export const MANIFEST_FILE = 'zrub-lock.json';
export const MUTATION_LOCK = '.zrub-mutation.lock';
export interface PackageRelease {
  name: string;
  version: string;
}
export type SourceProvenance =
  | { kind: 'unknown' }
  | { kind: 'known'; file: string; package: PackageRelease; hash: string };
export interface InstalledMapping {
  destination: string;
  ownership: 'file' | 'managed-block';
  provenance: 'written' | 'observed-existing';
  baselineHash: string;
  source: SourceProvenance;
}
export interface InstallationManifest {
  schemaVersion: 1;
  resources: Record<string, InstalledMapping[]>;
}
export interface ManifestSnapshot {
  manifest: InstallationManifest;
  hash: string | null;
}
export function hashBytes(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}
export async function readTarget(
  targetRoot: string,
  destinationPath: string,
): Promise<Buffer | null> {
  await assertSafeDestination(targetRoot, destinationPath);
  try {
    if (!(await lstat(destinationPath)).isFile())
      throw new Error(`Expected a regular file: ${destinationPath}`);
    return await readFile(destinationPath);
  } catch (error) {
    if (isMissingPath(error)) return null;
    throw error;
  }
}
export function blockBytes(resourceId: string, content: Buffer): Buffer | null {
  const state = inspectManagedBlock(resourceId, content.toString('latin1'));
  if (state.kind === 'malformed') throw new Error(state.reason);
  return state.kind === 'installed'
    ? content.subarray(state.startIndex, state.endIndex)
    : null;
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected an object');
  return value as Record<string, unknown>;
}
export function validateRelativeFile(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('\\') ||
    value.includes('\0') ||
    value.includes(':') ||
    path.posix.isAbsolute(value) ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error(`Unsafe relative file path: ${String(value)}`);
  return value;
}
function hash(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    throw new Error('Invalid SHA-256 hash');
  return value;
}
function packageRelease(value: unknown): PackageRelease {
  const item = object(value);
  if (
    item.name !== '@zheckan/zrub' ||
    typeof item.version !== 'string' ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
      item.version,
    )
  )
    throw new Error('Invalid package provenance');
  return { name: item.name, version: item.version };
}
export async function bundledRelease(): Promise<PackageRelease> {
  return packageRelease(
    JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ),
  );
}
function parseMapping(value: unknown): InstalledMapping {
  const item = object(value);
  if (item.ownership !== 'file' && item.ownership !== 'managed-block')
    throw new Error('Invalid ownership');
  if (item.provenance !== 'written' && item.provenance !== 'observed-existing')
    throw new Error('Invalid installation provenance');
  const source = object(item.source);
  let provenance: SourceProvenance;
  if (source.kind === 'unknown') provenance = { kind: 'unknown' };
  else if (source.kind === 'known')
    provenance = {
      kind: 'known',
      file: validateRelativeFile(source.file),
      package: packageRelease(source.package),
      hash: hash(source.hash),
    };
  else throw new Error('Invalid source provenance');
  return {
    destination: validateRelativeFile(item.destination),
    ownership: item.ownership,
    provenance: item.provenance,
    baselineHash: hash(item.baselineHash),
    source: provenance,
  };
}
export function assertMappingOwnership(manifest: InstallationManifest): void {
  const owners: Array<{ id: string; mapping: InstalledMapping }> = [];
  for (const [id, mappings] of Object.entries(manifest.resources)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))
      throw new Error(`Invalid resource ID: ${id}`);
    for (const mapping of mappings) {
      const destination = validateRelativeFile(
        mapping.destination,
      ).toLowerCase();
      if (
        [MANIFEST_FILE, MUTATION_LOCK].some(
          (reserved) =>
            destination === reserved || destination.startsWith(`${reserved}/`),
        )
      )
        throw new Error(`Reserved destination: ${mapping.destination}`);
      for (const owner of owners) {
        const previous = owner.mapping.destination.toLowerCase();
        const sharedBlocks =
          mapping.ownership === 'managed-block' &&
          owner.mapping.ownership === 'managed-block' &&
          mapping.destination === owner.mapping.destination &&
          id !== owner.id;
        if (
          (destination === previous && !sharedBlocks) ||
          destination.startsWith(`${previous}/`) ||
          previous.startsWith(`${destination}/`)
        )
          throw new Error(`Conflicting ownership: ${mapping.destination}`);
      }
      owners.push({ id, mapping });
    }
  }
}
export function mappingsFor(
  manifest: InstallationManifest,
  id: string,
): InstalledMapping[] {
  return Object.hasOwn(manifest.resources, id)
    ? (manifest.resources[id] ?? [])
    : [];
}
export async function readManifest(
  targetRoot: string,
): Promise<ManifestSnapshot> {
  const content = await readTarget(
    targetRoot,
    path.join(targetRoot, MANIFEST_FILE),
  );
  if (content === null)
    return { manifest: { schemaVersion: 1, resources: {} }, hash: null };
  try {
    const parsed = object(JSON.parse(content.toString('utf8')));
    if (parsed.schemaVersion !== 1)
      throw new Error(
        `Unsupported schema version: ${String(parsed.schemaVersion)}`,
      );
    const entries = Object.entries(object(parsed.resources)).map(
      ([id, values]) => {
        if (!Array.isArray(values) || !values.length)
          throw new Error(`Invalid mappings for ${id}`);
        return [id, values.map(parseMapping)] as const;
      },
    );
    const manifest: InstallationManifest = {
      schemaVersion: 1,
      resources: Object.fromEntries(entries),
    };
    assertMappingOwnership(manifest);
    for (const mappings of Object.values(manifest.resources))
      for (const mapping of mappings)
        await assertSafeDestination(
          targetRoot,
          path.join(targetRoot, mapping.destination),
        );
    return { manifest, hash: hashBytes(content) };
  } catch (error) {
    throw new Error(
      `Invalid ${MANIFEST_FILE}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
export function serializeManifest(manifest: InstallationManifest): string {
  return (
    JSON.stringify(
      {
        schemaVersion: 1,
        resources: Object.fromEntries(
          Object.entries(manifest.resources)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([id, mappings]) => [
              id,
              [...mappings].sort((a, b) =>
                a.destination.localeCompare(b.destination),
              ),
            ]),
        ),
      },
      null,
      2,
    ) + '\n'
  );
}
export function setMapping(
  manifest: InstallationManifest,
  id: string,
  destination: string,
  mapping: InstalledMapping | null,
): InstallationManifest {
  const resources = { ...manifest.resources };
  const mappings = mappingsFor(manifest, id).filter(
    (item) => item.destination !== destination,
  );
  if (mapping !== null) mappings.push(mapping);
  if (mappings.length) resources[id] = mappings;
  else delete resources[id];
  return { schemaVersion: 1, resources };
}
