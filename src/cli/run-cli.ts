import path from 'node:path';

import { asError } from '../errors.js';
import type { LoadedResource } from '../catalog/types.js';
import type { ExecutionResult, InstallationPlan } from '../installer/types.js';
import {
  choosePlanOperation,
  type PlanOptions,
} from '../installer/plan-installation.js';
import { formatPlanReview } from './format-review.js';
import { CANCELLED, type UiPort } from './ui.js';

export interface CliDependencies {
  targetRoot: string;
  resourcesRoot: string;
  ui: UiPort;
  action?: 'install' | 'update' | 'remove';
  resourceIds?: string[];
  loadCatalog(resourcesRoot: string): Promise<LoadedResource[]>;
  planInstallation(
    resources: LoadedResource[],
    targetRoot: string,
    options?: PlanOptions,
  ): Promise<InstallationPlan>;
  applyInstallationPlan(plan: InstallationPlan): Promise<ExecutionResult>;
}

function countMessage(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export async function runCli({
  targetRoot,
  resourcesRoot,
  ui,
  loadCatalog,
  planInstallation,
  applyInstallationPlan,
  action = 'install',
  resourceIds,
}: CliDependencies): Promise<number> {
  try {
    ui.intro('Zrub');
    const resources = await loadCatalog(resourcesRoot);
    const selection =
      action === 'install' ? await ui.selectResources(resources) : null;

    if (selection === CANCELLED) {
      ui.outro('Installation cancelled.');
      return 0;
    }
    if (selection !== null && selection.length === 0) {
      ui.outro('No resources selected.');
      return 0;
    }

    const resourcesById = new Map(
      resources.map((resource) => [resource.id, resource]),
    );
    const selectedResources =
      selection === null
        ? resources
        : selection.map((resourceId) => {
            const selectedResource = resourcesById.get(resourceId);
            if (selectedResource === undefined) {
              throw new Error(`Unknown resource selected: ${resourceId}`);
            }
            return selectedResource;
          });

    let plan =
      action === 'install'
        ? await planInstallation(selectedResources, targetRoot)
        : await planInstallation(selectedResources, targetRoot, {
            intent: action,
            ...(resourceIds === undefined ||
            (action === 'update' && !resourceIds.length)
              ? {}
              : { resourceIds }),
          });
    if (!plan.hasBlockingConflicts) {
      const choices = plan.operations.flatMap((operation, index) =>
        operation.kind === 'local-edit-conflict' ||
        (action === 'remove' && operation.kind === 'retain')
          ? [
              {
                value: String(index),
                label: `[${operation.resourceId}] ${path.relative(targetRoot, operation.destinationPath)}`,
                hint: operation.conflictReason ?? '',
              },
            ]
          : [],
      );
      if (choices.length) {
        const chosen = await ui.selectChanges(
          action === 'remove'
            ? 'Select retained files to forget tracking; their contents stay intact'
            : 'Select edited files to replace with bundled contents; unselected files stay intact',
          choices,
        );
        if (chosen === CANCELLED) {
          ui.outro('Installation cancelled.');
          return 0;
        }
        if (
          chosen.some(
            (value) => !choices.some((option) => option.value === value),
          )
        )
          throw new Error('Unknown change selected');
        for (const choice of choices) {
          if (chosen.includes(choice.value))
            plan = choosePlanOperation(
              plan,
              Number(choice.value),
              action === 'remove' ? 'forget' : 'replace',
            );
          else if (action === 'update')
            plan = choosePlanOperation(plan, Number(choice.value), 'retain');
        }
      }
    }
    ui.showReview(formatPlanReview(plan, targetRoot));

    if (plan.hasBlockingConflicts) {
      ui.error('Resolve blocking conflicts and run the CLI again.');
      return 1;
    }

    if (plan.hasReplacementConflicts) {
      const replacementCount = plan.operations.filter(
        (operation) => operation.kind === 'replace-conflict',
      ).length;
      ui.warn(
        `This plan will replace ${countMessage(
          replacementCount,
          'existing file',
          'existing files',
        )}.`,
      );
    }

    const confirmed = await ui.confirm(
      action === 'install'
        ? 'Apply this installation plan?'
        : `Apply this ${action} plan?`,
    );
    if (confirmed === CANCELLED) {
      ui.outro('Installation cancelled.');
      return 0;
    }
    if (!confirmed) {
      ui.outro('No changes were made.');
      return 0;
    }

    const result = await applyInstallationPlan(plan);
    if (result.status === 'failed') {
      if (result.completed.length > 0) {
        ui.warn(
          `${countMessage(
            result.completed.length,
            'earlier operation',
            'earlier operations',
          )} succeeded.`,
        );
      }
      ui.error(
        `${result.phase === 'checkpoint' ? 'Manifest checkpoint failed after' : 'Installation stopped at'} ${path.basename(
          result.failed.destinationPath,
        )}: ${result.error.message}`,
      );
      if (result.untracked.length)
        ui.warn(
          `Payload changes succeeded without a manifest checkpoint: ${result.untracked.map((operation) => path.relative(targetRoot, operation.destinationPath)).join(', ')}. Inspect status before retrying.`,
        );
      return 1;
    }

    ui.info(
      action === 'install'
        ? `Installed ${countMessage(result.completed.filter((operation) => 'nextContent' in operation).length, 'file', 'files')}.`
        : `Completed ${countMessage(result.completed.length, 'operation', 'operations')}.`,
    );
    if (
      result.completed.some(
        (operation) =>
          operation.template &&
          (operation.kind === 'create' || operation.kind === 'prepend'),
      )
    ) {
      ui.warn('Customize the placeholders in the installed template.');
    }
    ui.outro(
      action === 'install'
        ? 'Installation complete.'
        : `${action === 'update' ? 'Update' : 'Removal'} complete.`,
    );
    return 0;
  } catch (error) {
    ui.error(asError(error).message);
    return 1;
  }
}
