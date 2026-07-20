import path from 'node:path';

import type { LoadedResource } from '../catalog/types.js';
import type { ExecutionResult, InstallationPlan } from '../installer/types.js';
import { formatPlanReview } from './format-review.js';
import { CANCELLED, type UiPort } from './ui.js';

export interface CliDependencies {
  targetRoot: string;
  resourcesRoot: string;
  ui: UiPort;
  loadCatalog(resourcesRoot: string): Promise<LoadedResource[]>;
  planInstallation(
    resources: LoadedResource[],
    targetRoot: string,
  ): Promise<InstallationPlan>;
  applyInstallationPlan(plan: InstallationPlan): Promise<ExecutionResult>;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
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
}: CliDependencies): Promise<number> {
  try {
    ui.intro('Project Blueprints');
    const resources = await loadCatalog(resourcesRoot);
    const selection = await ui.selectResources(resources);

    if (selection === CANCELLED) {
      ui.outro('Installation cancelled.');
      return 0;
    }
    if (selection.length === 0) {
      ui.outro('No resources selected.');
      return 0;
    }

    const resourcesById = new Map(
      resources.map((resource) => [resource.id, resource]),
    );
    const selectedResources = selection.map((resourceId) => {
      const selectedResource = resourcesById.get(resourceId);
      if (selectedResource === undefined) {
        throw new Error(`Unknown resource selected: ${resourceId}`);
      }
      return selectedResource;
    });

    const plan = await planInstallation(selectedResources, targetRoot);
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

    const confirmed = await ui.confirm('Apply this installation plan?');
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
        `Installation stopped at ${path.basename(
          result.failed.destinationPath,
        )}: ${result.error.message}`,
      );
      return 1;
    }

    ui.info(
      `Installed ${countMessage(result.completed.length, 'file', 'files')}.`,
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
    ui.outro('Installation complete.');
    return 0;
  } catch (error) {
    ui.error(asError(error).message);
    return 1;
  }
}
