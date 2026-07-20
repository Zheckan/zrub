export type InstallationOperationKind =
  | 'create'
  | 'prepend'
  | 'replace-conflict'
  | 'unchanged'
  | 'already-installed'
  | 'malformed-markers-conflict';

export interface InstallationOperation {
  resourceId: string;
  sourcePath: string;
  destinationPath: string;
  kind: InstallationOperationKind;
  nextContent?: string;
  conflictReason?: string;
  template: boolean;
}

export interface InstallationPlan {
  targetRoot: string;
  operations: InstallationOperation[];
  hasReplacementConflicts: boolean;
  hasBlockingConflicts: boolean;
}
