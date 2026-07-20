import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { LoadedResource } from '../../src/catalog/types.js';
import { runCli, type CliDependencies } from '../../src/cli/run-cli.js';
import {
  CANCELLED,
  type Cancelled,
  type ReviewGroup,
  type UiPort,
} from '../../src/cli/ui.js';
import type {
  ExecutionResult,
  InstallationOperation,
  InstallationPlan,
} from '../../src/installer/types.js';

const targetRoot = path.resolve('/target');

function resource(id: string, kind: 'guide' | 'template' = 'guide') {
  return {
    schemaVersion: 1,
    id,
    name: id,
    description: `${id} description`,
    kind,
    directoryPath: `/catalog/${id}`,
    files: [],
  } satisfies LoadedResource;
}

function operation(
  resourceId: string,
  kind: InstallationOperation['kind'] = 'create',
  template = false,
): InstallationOperation {
  return {
    resourceId,
    sourcePath: `/catalog/${resourceId}/file.md`,
    destinationPath: path.join(targetRoot, `${resourceId}.md`),
    kind,
    ...(kind === 'create' || kind === 'prepend' || kind === 'replace-conflict'
      ? { nextContent: 'content\n' }
      : {}),
    template,
  };
}

function installationPlan(
  operations: InstallationOperation[] = [operation('guide')],
  options: { replacement?: boolean; blocking?: boolean } = {},
): InstallationPlan {
  return {
    targetRoot,
    operations,
    hasReplacementConflicts: options.replacement ?? false,
    hasBlockingConflicts: options.blocking ?? false,
  };
}

class RecordingUi implements UiPort {
  readonly events: string[] = [];

  constructor(
    private readonly selection: string[] | Cancelled = ['guide'],
    private readonly confirmation: boolean | Cancelled = true,
  ) {}

  intro(title: string): void {
    this.events.push(`intro:${title}`);
  }

  async selectResources(): Promise<string[] | Cancelled> {
    this.events.push('select');
    return this.selection;
  }

  showReview(groups: ReviewGroup[]): void {
    this.events.push(
      `review:${groups.map((group) => group.heading).join(',')}`,
    );
  }

  async confirm(message: string): Promise<boolean | Cancelled> {
    this.events.push(`confirm:${message}`);
    return this.confirmation;
  }

  info(message: string): void {
    this.events.push(`info:${message}`);
  }

  warn(message: string): void {
    this.events.push(`warn:${message}`);
  }

  error(message: string): void {
    this.events.push(`error:${message}`);
  }

  outro(message: string): void {
    this.events.push(`outro:${message}`);
  }
}

function dependencies(
  ui: UiPort,
  options: {
    resources?: LoadedResource[];
    plan?: InstallationPlan;
    result?: ExecutionResult;
  } = {},
): CliDependencies {
  const resources = options.resources ?? [resource('guide')];
  const plan = options.plan ?? installationPlan();
  const result = options.result ?? {
    status: 'completed',
    completed: plan.operations.filter((item) => item.kind === 'create'),
  };

  return {
    targetRoot,
    resourcesRoot: '/catalog',
    ui,
    loadCatalog: vi.fn(async () => resources),
    planInstallation: vi.fn(async () => plan),
    applyInstallationPlan: vi.fn(async () => result),
  };
}

describe('runCli', () => {
  it('exits cleanly when resource selection is cancelled', async () => {
    const ui = new RecordingUi(CANCELLED);
    const deps = dependencies(ui);

    await expect(runCli(deps)).resolves.toBe(0);
    expect(deps.planInstallation).not.toHaveBeenCalled();
    expect(ui.events).toEqual([
      'intro:Project Blueprints',
      'select',
      'outro:Installation cancelled.',
    ]);
  });

  it('exits without planning when no resources are selected', async () => {
    const ui = new RecordingUi([]);
    const deps = dependencies(ui);

    await expect(runCli(deps)).resolves.toBe(0);
    expect(deps.planInstallation).not.toHaveBeenCalled();
    expect(ui.events.at(-1)).toBe('outro:No resources selected.');
  });

  it('reports an unknown selected resource as an internal error', async () => {
    const ui = new RecordingUi(['missing']);

    await expect(runCli(dependencies(ui))).resolves.toBe(1);
    expect(ui.events.at(-1)).toBe('error:Unknown resource selected: missing');
  });

  it('shows the complete review before asking for confirmation', async () => {
    const ui = new RecordingUi();

    await expect(runCli(dependencies(ui))).resolves.toBe(0);

    const reviewIndex = ui.events.findIndex((event) =>
      event.startsWith('review:'),
    );
    const confirmIndex = ui.events.findIndex((event) =>
      event.startsWith('confirm:'),
    );
    expect(reviewIndex).toBeGreaterThan(-1);
    expect(confirmIndex).toBeGreaterThan(reviewIndex);
  });

  it('stops on blocking conflicts without asking for confirmation', async () => {
    const ui = new RecordingUi();
    const blocking = operation('agents', 'malformed-markers-conflict', true);
    blocking.conflictReason = 'Missing end marker';
    const deps = dependencies(ui, {
      plan: installationPlan([blocking], { blocking: true }),
    });

    await expect(runCli(deps)).resolves.toBe(1);
    expect(ui.events.some((event) => event.startsWith('confirm:'))).toBe(false);
    expect(ui.events.at(-1)).toBe(
      'error:Resolve blocking conflicts and run the CLI again.',
    );
    expect(deps.applyInstallationPlan).not.toHaveBeenCalled();
  });

  it('warns about replacements before the single confirmation', async () => {
    const ui = new RecordingUi();
    const replacement = operation('guide', 'replace-conflict');

    await expect(
      runCli(
        dependencies(ui, {
          plan: installationPlan([replacement], { replacement: true }),
        }),
      ),
    ).resolves.toBe(0);

    const warningIndex = ui.events.findIndex((event) =>
      event.startsWith('warn:This plan will replace'),
    );
    const confirmIndex = ui.events.findIndex((event) =>
      event.startsWith('confirm:'),
    );
    expect(warningIndex).toBeGreaterThan(-1);
    expect(confirmIndex).toBeGreaterThan(warningIndex);
  });

  it.each([
    ['cancelled', CANCELLED, 'Installation cancelled.'],
    ['declined', false, 'No changes were made.'],
  ] as const)(
    'does not execute when confirmation is %s',
    async (_name, confirmation, expectedOutro) => {
      const ui = new RecordingUi(['guide'], confirmation);
      const deps = dependencies(ui);

      await expect(runCli(deps)).resolves.toBe(0);
      expect(deps.applyInstallationPlan).not.toHaveBeenCalled();
      expect(ui.events.at(-1)).toBe(`outro:${expectedOutro}`);
    },
  );

  it('summarizes success and reminds users about installed templates', async () => {
    const ui = new RecordingUi(['agents']);
    const createdTemplate = operation('agents', 'create', true);
    const plan = installationPlan([createdTemplate]);

    await expect(
      runCli(
        dependencies(ui, {
          resources: [resource('agents', 'template')],
          plan,
          result: { status: 'completed', completed: [createdTemplate] },
        }),
      ),
    ).resolves.toBe(0);

    expect(ui.events).toContain('info:Installed 1 file.');
    expect(ui.events).toContain(
      'warn:Customize the placeholders in the installed template.',
    );
    expect(ui.events.at(-1)).toBe('outro:Installation complete.');
  });

  it('reports exact partial execution failure and returns exit code 1', async () => {
    const ui = new RecordingUi();
    const first = operation('first');
    const second = operation('second');
    const result: ExecutionResult = {
      status: 'failed',
      completed: [first],
      failed: second,
      error: new Error('disk full'),
    };

    await expect(
      runCli(
        dependencies(ui, {
          resources: [resource('guide')],
          plan: installationPlan([first, second]),
          result,
        }),
      ),
    ).resolves.toBe(1);

    expect(ui.events).toContain('warn:1 earlier operation succeeded.');
    expect(ui.events.at(-1)).toBe(
      'error:Installation stopped at second.md: disk full',
    );
  });
});
