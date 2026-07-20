import path from 'node:path';

import type {
  InstallationOperation,
  InstallationOperationKind,
  InstallationPlan,
} from '../installer/types.js';
import type { ReviewGroup } from './ui.js';

interface GroupDefinition {
  kind: InstallationOperationKind;
  heading: string;
  severity: ReviewGroup['severity'];
}

const GROUP_DEFINITIONS: GroupDefinition[] = [
  { kind: 'create', heading: 'CREATE', severity: 'normal' },
  { kind: 'prepend', heading: 'PREPEND', severity: 'normal' },
  {
    kind: 'replace-conflict',
    heading: 'REPLACE - CONFLICT',
    severity: 'warning',
  },
  { kind: 'unchanged', heading: 'UNCHANGED', severity: 'normal' },
  {
    kind: 'already-installed',
    heading: 'ALREADY INSTALLED',
    severity: 'normal',
  },
  {
    kind: 'malformed-markers-conflict',
    heading: 'MALFORMED MARKERS - BLOCKING',
    severity: 'blocking',
  },
];

function displayPath(targetRoot: string, destinationPath: string): string {
  return path.relative(targetRoot, destinationPath).split(path.sep).join('/');
}

function formatEntry(
  operation: InstallationOperation,
  targetRoot: string,
): string {
  const base = `[${operation.resourceId}] ${displayPath(
    targetRoot,
    operation.destinationPath,
  )}`;
  return operation.conflictReason === undefined
    ? base
    : `${base} - ${operation.conflictReason}`;
}

export function formatPlanReview(
  plan: InstallationPlan,
  targetRoot: string,
): ReviewGroup[] {
  return GROUP_DEFINITIONS.flatMap((definition) => {
    const entries = plan.operations
      .filter((operation) => operation.kind === definition.kind)
      .map((operation) => formatEntry(operation, targetRoot));

    return entries.length === 0
      ? []
      : [
          {
            heading: definition.heading,
            entries,
            severity: definition.severity,
          },
        ];
  });
}
