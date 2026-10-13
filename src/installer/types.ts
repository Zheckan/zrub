import type { InstalledMapping, ManifestSnapshot } from './manifest.js';
interface OperationBase {
  resourceId: string;
  sourcePath: string;
  destinationPath: string;
  expectedHash: string | null;
  template: boolean;
  conflictReason?: string;
}
export type InstallationOperation = OperationBase &
  (
    | {
        kind:
          | 'create'
          | 'prepend'
          | 'replace-conflict'
          | 'update'
          | 'local-edit-conflict';
        nextContent: string | Buffer;
        mapping: InstalledMapping;
      }
    | { kind: 'track'; mapping: InstalledMapping }
    | {
        kind:
          | 'delete'
          | 'forget'
          | 'unchanged'
          | 'already-installed'
          | 'malformed-markers-conflict'
          | 'retain'
          | 'migration-conflict';
      }
  );
export type InstallationOperationKind = InstallationOperation['kind'];
export interface InstallationPlan {
  targetRoot: string;
  manifest: ManifestSnapshot;
  operations: InstallationOperation[];
  hasReplacementConflicts: boolean;
  hasBlockingConflicts: boolean;
}
export type ExecutionResult =
  | { status: 'completed'; completed: InstallationOperation[] }
  | {
      status: 'failed';
      phase: 'payload' | 'checkpoint' | 'precondition';
      completed: InstallationOperation[];
      untracked: InstallationOperation[];
      failed: InstallationOperation;
      error: Error;
    };
