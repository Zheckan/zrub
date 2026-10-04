import { describe, expect, it, vi } from 'vitest';

import type { LoadedResource } from '../../src/catalog/types.js';
import { createClackUi, type ClackFunctions } from '../../src/cli/clack-ui.js';
import { CANCELLED } from '../../src/cli/ui.js';

function resource(): LoadedResource {
  return {
    schemaVersion: 1,
    id: 'frontend-project-structure',
    name: 'Frontend project structure',
    description: 'A feature-oriented React structure.',
    kind: 'guide',
    directoryPath: '/catalog/frontend-project-structure',
    files: [],
  };
}

function fakeClack(
  selection: string[] | symbol = ['frontend-project-structure'],
  confirmation: boolean | symbol = true,
): ClackFunctions {
  return {
    intro: vi.fn(),
    outro: vi.fn(),
    multiselect: vi.fn(async () => selection),
    confirm: vi.fn(async () => confirmation),
    isCancel: vi.fn((value) => typeof value === 'symbol'),
    note: vi.fn(),
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

describe('createClackUi', () => {
  it('maps catalog resources into multiselect options', async () => {
    const clack = fakeClack();
    const ui = createClackUi(clack);

    await expect(ui.selectResources([resource()])).resolves.toEqual([
      'frontend-project-structure',
    ]);
    expect(clack.multiselect).toHaveBeenCalledWith({
      message: 'Select resources to install',
      required: false,
      options: [
        {
          value: 'frontend-project-structure',
          label: 'Frontend project structure',
          hint: 'guide - A feature-oriented React structure.',
        },
      ],
    });
  });

  it('maps multiselect cancellation to the shared token', async () => {
    const clack = fakeClack(Symbol('cancelled'));

    await expect(
      createClackUi(clack).selectResources([resource()]),
    ).resolves.toBe(CANCELLED);
  });

  it('maps confirmation cancellation to the shared token', async () => {
    const clack = fakeClack([], Symbol('cancelled'));

    await expect(createClackUi(clack).confirm('Apply?')).resolves.toBe(
      CANCELLED,
    );
  });

  it('renders every review group and emphasizes warning severities', () => {
    const clack = fakeClack();
    const ui = createClackUi(clack);

    ui.showReview([
      { heading: 'CREATE', entries: ['one'], severity: 'normal' },
      {
        heading: 'REPLACE - CONFLICT',
        entries: ['two'],
        severity: 'warning',
      },
      {
        heading: 'MALFORMED MARKERS - BLOCKING',
        entries: ['three'],
        severity: 'blocking',
      },
    ]);

    expect(clack.note).toHaveBeenCalledTimes(3);
    expect(clack.note).toHaveBeenCalledWith('two', 'REPLACE - CONFLICT');
    expect(clack.log.warn).toHaveBeenCalledWith(
      'The review contains replacement conflicts.',
    );
    expect(clack.log.error).toHaveBeenCalledWith(
      'The review contains blocking conflicts.',
    );
  });

  it('routes lifecycle messages to the matching Clack functions', () => {
    const clack = fakeClack();
    const ui = createClackUi(clack);

    ui.intro('Intro');
    ui.info('Info');
    ui.warn('Warn');
    ui.error('Error');
    ui.outro('Outro');

    expect(clack.intro).toHaveBeenCalledWith('Intro');
    expect(clack.log.info).toHaveBeenCalledWith('Info');
    expect(clack.log.warn).toHaveBeenCalledWith('Warn');
    expect(clack.log.error).toHaveBeenCalledWith('Error');
    expect(clack.outro).toHaveBeenCalledWith('Outro');
  });
});
