import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { formatPlanReview } from '../../src/cli/format-review.js';
import type {
  InstallationOperation,
  InstallationOperationKind,
  InstallationPlan,
} from '../../src/installer/types.js';

function operation(
  targetRoot: string,
  kind: InstallationOperationKind,
  name: string,
  conflictReason?: string,
): InstallationOperation {
  return {
    resourceId: name,
    sourcePath: `/catalog/${name}.md`,
    destinationPath: path.join(targetRoot, 'docs', `${name}.md`),
    kind,
    ...(conflictReason === undefined ? {} : { conflictReason }),
    template: false,
  };
}

describe('formatPlanReview', () => {
  it('groups every operation in a stable user-facing order', () => {
    const targetRoot = path.resolve('/project');
    const operations = [
      operation(targetRoot, 'already-installed', 'installed'),
      operation(targetRoot, 'replace-conflict', 'replacement'),
      operation(targetRoot, 'create', 'created'),
      operation(
        targetRoot,
        'malformed-markers-conflict',
        'malformed',
        'Expected one end marker',
      ),
      operation(targetRoot, 'prepend', 'prepended'),
      operation(targetRoot, 'unchanged', 'same'),
    ];
    const plan: InstallationPlan = {
      targetRoot,
      operations,
      hasReplacementConflicts: true,
      hasBlockingConflicts: true,
    };

    expect(formatPlanReview(plan, targetRoot)).toEqual([
      {
        heading: 'CREATE',
        entries: ['[created] docs/created.md'],
        severity: 'normal',
      },
      {
        heading: 'PREPEND',
        entries: ['[prepended] docs/prepended.md'],
        severity: 'normal',
      },
      {
        heading: 'REPLACE - CONFLICT',
        entries: ['[replacement] docs/replacement.md'],
        severity: 'warning',
      },
      {
        heading: 'UNCHANGED',
        entries: ['[same] docs/same.md'],
        severity: 'normal',
      },
      {
        heading: 'ALREADY INSTALLED',
        entries: ['[installed] docs/installed.md'],
        severity: 'normal',
      },
      {
        heading: 'MALFORMED MARKERS - BLOCKING',
        entries: ['[malformed] docs/malformed.md - Expected one end marker'],
        severity: 'blocking',
      },
    ]);
  });

  it('omits empty groups and normalizes separators for display', () => {
    const targetRoot = path.resolve('/project');
    const plan: InstallationPlan = {
      targetRoot,
      operations: [operation(targetRoot, 'create', 'created')],
      hasReplacementConflicts: false,
      hasBlockingConflicts: false,
    };

    const groups = formatPlanReview(plan, targetRoot);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.entries[0]).not.toContain('\\');
  });
});
