import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { LoadedResource } from '../catalog/types.js';
import { resolveDestination } from './destination.js';
import { inspectManagedBlock, wrapManagedBlock } from './managed-block.js';
import {
  assertMappingOwnership,
  blockBytes,
  bundledRelease,
  hashBytes,
  mappingsFor,
  readManifest,
  readTarget,
  setMapping,
  validateRelativeFile,
  type InstalledMapping,
  type PackageRelease,
} from './manifest.js';
import type { InstallationOperation, InstallationPlan } from './types.js';
import { inspectMapping, matchingFile } from './status.js';

export interface PlanOptions {
  release?: PackageRelease;
  intent?: 'install' | 'update' | 'remove';
  resourceIds?: string[];
}

export function choosePlanOperation(
  plan: InstallationPlan,
  index: number,
  choice: 'replace' | 'retain' | 'forget',
): InstallationPlan {
  const operation = plan.operations[index];
  if (operation === undefined) throw new Error('Unknown operation');
  let next: InstallationOperation;
  if (operation.kind === 'local-edit-conflict' && choice === 'replace')
    next = { ...operation, kind: 'replace-conflict' };
  else if (
    (operation.kind === 'local-edit-conflict' && choice === 'retain') ||
    (operation.kind === 'retain' && choice === 'forget')
  ) {
    const { resourceId, sourcePath, destinationPath, expectedHash, template } =
      operation;
    next = {
      resourceId,
      sourcePath,
      destinationPath,
      expectedHash,
      template,
      kind: choice === 'forget' ? 'forget' : 'retain',
      conflictReason:
        choice === 'forget'
          ? 'Forget tracking; keep file contents.'
          : 'Keep local edits and their original baseline.',
    };
  } else throw new Error('Invalid operation choice');
  return finishPlan({
    ...plan,
    operations: plan.operations.map((item, itemIndex) =>
      itemIndex === index ? next : item,
    ),
  });
}

export function finishPlan(plan: InstallationPlan): InstallationPlan {
  return {
    ...plan,
    hasReplacementConflicts: plan.operations.some(
      (operation) => operation.kind === 'replace-conflict',
    ),
    hasBlockingConflicts: plan.operations.some(
      (operation) =>
        operation.kind === 'malformed-markers-conflict' ||
        operation.kind === 'migration-conflict',
    ),
  };
}

export async function planInstallation(
  resources: LoadedResource[],
  targetRoot: string,
  options: PlanOptions = {},
): Promise<InstallationPlan> {
  const root = path.resolve(targetRoot);
  const snapshot = await readManifest(root);
  const release = options.release ?? (await bundledRelease());
  if (options.intent === 'update' || options.intent === 'remove') {
    const ids =
      options.resourceIds ?? Object.keys(snapshot.manifest.resources).sort();
    if (options.intent === 'remove' && !options.resourceIds?.length)
      throw new Error('Select resource IDs to remove');
    for (const id of ids)
      if (!mappingsFor(snapshot.manifest, id).length)
        throw new Error(`Resource is not tracked: ${id}`);
    const operations: InstallationOperation[] = [];
    for (const id of new Set(ids)) {
      const mappings = mappingsFor(snapshot.manifest, id);
      const resource = resources.find((item) => item.id === id);
      const migration =
        resource !== undefined &&
        (resource.files.length !== mappings.length ||
          mappings.some(
            (mapping) => matchingFile(resource, mapping, root) === undefined,
          ));
      for (const mapping of mappings) {
        const destinationPath = path.join(root, mapping.destination);
        const current = await readTarget(root, destinationPath);
        const base = {
          resourceId: id,
          sourcePath: '',
          destinationPath,
          expectedHash: current === null ? null : hashBytes(current),
          template: resource?.kind === 'template',
        };
        const state = await inspectMapping(
          id,
          mapping,
          resource,
          root,
          current,
        );
        if (options.intent === 'remove') {
          operations.push({
            ...base,
            kind:
              current === null
                ? 'forget'
                : mapping.ownership === 'file' &&
                    mapping.provenance === 'written' &&
                    state.local === 'unchanged'
                  ? 'delete'
                  : 'retain',
            conflictReason:
              current === null
                ? 'Remove record for missing file.'
                : mapping.ownership === 'managed-block'
                  ? 'Shared editable block is preserved.'
                  : mapping.provenance === 'observed-existing'
                    ? 'Existing file was adopted; preserve it.'
                    : state.local === 'modified'
                      ? 'Local edits are preserved.'
                      : 'Remove unchanged Zrub-written file.',
          });
          continue;
        }
        if (resource === undefined) {
          operations.push({
            ...base,
            kind: 'retain',
            conflictReason: 'Resource unavailable in the bundled catalog.',
          });
          continue;
        }
        if (migration) {
          operations.push({
            ...base,
            kind: 'migration-conflict',
            conflictReason:
              'Mappings, source variants, or policies changed; migration requires manual review.',
          });
          continue;
        }
        if (state.local === 'malformed-block') {
          operations.push({
            ...base,
            kind: 'malformed-markers-conflict',
            conflictReason: 'Repair malformed markers before updating.',
          });
          continue;
        }
        if (mapping.ownership === 'managed-block') {
          operations.push({
            ...base,
            kind: 'retain',
            conflictReason: `Managed block preserved; bundled source ${state.catalog}. Review source changes manually with zrub read ${id}.`,
          });
          continue;
        }
        const file = matchingFile(resource, mapping, root);
        if (file === undefined) throw new Error('Missing mapped source');
        const payload = await readFile(file.sourcePath);
        const nextMapping: InstalledMapping = {
          ...mapping,
          provenance: current === null ? 'written' : mapping.provenance,
          baselineHash: hashBytes(payload),
          source: {
            kind: 'known',
            file: file.source,
            package: release,
            hash: hashBytes(payload),
          },
        };
        if (current === null)
          operations.push({
            ...base,
            sourcePath: file.sourcePath,
            kind: 'create',
            nextContent: payload,
            mapping: nextMapping,
          });
        else if (current.equals(payload))
          operations.push(
            mapping.baselineHash === hashBytes(current)
              ? { ...base, kind: 'unchanged' }
              : {
                  ...base,
                  kind: 'track',
                  mapping: nextMapping,
                  conflictReason:
                    'Review baseline change to matching current contents.',
                },
          );
        else
          operations.push({
            ...base,
            sourcePath: file.sourcePath,
            kind:
              state.local === 'unchanged' ? 'update' : 'local-edit-conflict',
            nextContent: payload,
            mapping: { ...nextMapping, provenance: 'written' },
            conflictReason:
              state.local === 'unchanged'
                ? 'Bundled payload changed.'
                : `Local edits; bundled source ${state.catalog}. Default is to preserve the file.`,
          });
      }
    }
    return finishPlan({
      targetRoot: root,
      manifest: snapshot,
      operations,
      hasBlockingConflicts: false,
      hasReplacementConflicts: false,
    });
  }
  const operations: InstallationOperation[] = [];
  const contents = new Map<string, Buffer | null>();
  const seen = new Set<string>();
  let projected = snapshot.manifest;
  for (const resource of resources) {
    const existingMappings = mappingsFor(snapshot.manifest, resource.id);
    if (
      existingMappings.some(
        (mapping) => matchingFile(resource, mapping, root) === undefined,
      )
    ) {
      for (const mapping of existingMappings) {
        const destinationPath = path.join(root, mapping.destination);
        const current = await readTarget(root, destinationPath);
        operations.push({
          resourceId: resource.id,
          sourcePath: '',
          destinationPath,
          expectedHash: current === null ? null : hashBytes(current),
          template: resource.kind === 'template',
          kind: 'migration-conflict',
          conflictReason:
            'Tracked mappings or policies changed; preserve existing files and review migration manually.',
        });
      }
      continue;
    }
    for (const file of resource.files) {
      const destinationPath = resolveDestination(root, file);
      const destination = validateRelativeFile(
        path.relative(root, destinationPath).split(path.sep).join('/'),
      );
      const key = `${resource.id}:${destination.toLowerCase()}`;
      if (seen.has(key)) throw new Error(`Duplicate mapping: ${destination}`);
      seen.add(key);
      const current = contents.has(destinationPath)
        ? (contents.get(destinationPath) ?? null)
        : await readTarget(root, destinationPath);
      const expectedHash = current === null ? null : hashBytes(current);
      const tracked = mappingsFor(snapshot.manifest, resource.id).find(
        (mapping) => mapping.destination === destination,
      );
      const managed = file.onExisting === 'managed-prepend-once';
      const sourcePath =
        tracked?.source.kind === 'known'
          ? tracked.source.file === file.existingSource
            ? (file.existingSourcePath ?? file.sourcePath)
            : file.sourcePath
          : managed && current !== null
            ? (file.existingSourcePath ?? file.sourcePath)
            : file.sourcePath;
      const payload = await readFile(sourcePath);
      const base = {
        resourceId: resource.id,
        sourcePath,
        destinationPath,
        expectedHash,
        template: resource.kind === 'template',
      };
      const mapping: InstalledMapping = {
        destination,
        ownership: managed ? 'managed-block' : 'file',
        provenance: 'written',
        baselineHash: hashBytes(payload),
        source: {
          kind: 'known',
          file: validateRelativeFile(
            path
              .relative(resource.directoryPath, sourcePath)
              .split(path.sep)
              .join('/'),
          ),
          package: release,
          hash: hashBytes(payload),
        },
      };
      let operation: InstallationOperation;
      if (current === null) {
        const nextContent = managed
          ? wrapManagedBlock(resource.id, payload)
          : payload;
        mapping.baselineHash = hashBytes(
          managed
            ? (blockBytes(resource.id, nextContent) ?? nextContent)
            : nextContent,
        );
        operation = { ...base, kind: 'create', nextContent, mapping };
      } else if (managed) {
        const state = inspectManagedBlock(
          resource.id,
          current.toString('latin1'),
        );
        if (state.kind === 'malformed')
          operation = {
            ...base,
            kind: 'malformed-markers-conflict',
            conflictReason: state.reason,
          };
        else if (state.kind === 'installed') {
          operation =
            tracked === undefined
              ? {
                  ...base,
                  kind: 'track',
                  mapping: {
                    destination,
                    ownership: 'managed-block',
                    provenance: 'observed-existing',
                    baselineHash: hashBytes(
                      current.subarray(state.startIndex, state.endIndex),
                    ),
                    source: { kind: 'unknown' },
                  },
                  conflictReason:
                    'Observe existing block; original source is unknown. Contents preserved.',
                }
              : { ...base, kind: 'already-installed' };
        } else {
          const block = wrapManagedBlock(resource.id, payload);
          mapping.baselineHash = hashBytes(
            blockBytes(resource.id, block) ?? block,
          );
          operation = {
            ...base,
            kind: 'prepend',
            nextContent: Buffer.concat([block, Buffer.from('\n'), current]),
            mapping,
          };
        }
      } else if (current.equals(payload)) {
        operation =
          tracked === undefined || tracked.baselineHash !== hashBytes(current)
            ? {
                ...base,
                kind: 'track',
                mapping: {
                  ...mapping,
                  provenance: tracked?.provenance ?? 'observed-existing',
                },
                conflictReason:
                  'Record matching existing contents without changing the file.',
              }
            : { ...base, kind: 'unchanged' };
      } else
        operation = {
          ...base,
          kind: 'replace-conflict',
          nextContent: payload,
          mapping,
        };
      operations.push(operation);
      if ('mapping' in operation) {
        projected = setMapping(
          projected,
          resource.id,
          destination,
          operation.mapping,
        );
        assertMappingOwnership(projected);
      }
      contents.set(
        destinationPath,
        'nextContent' in operation
          ? Buffer.from(operation.nextContent)
          : current,
      );
    }
  }
  return finishPlan({
    targetRoot: root,
    manifest: snapshot,
    operations,
    hasBlockingConflicts: false,
    hasReplacementConflicts: false,
  });
}
