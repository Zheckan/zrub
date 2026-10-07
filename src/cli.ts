#!/usr/bin/env node

import { bundledResourcesRoot } from './catalog/bundled-root.js';
import { loadCatalog } from './catalog/load-catalog.js';
import { runCommand } from './cli/commands.js';
import { runCli } from './cli/run-cli.js';
import { applyInstallationPlan } from './installer/apply-plan.js';
import { planInstallation } from './installer/plan-installation.js';

process.exitCode = await runCommand(process.argv.slice(2), {
  resourcesRoot: bundledResourcesRoot(),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  install: async () => {
    const { createClackUi } = await import('./cli/clack-ui.js');
    return runCli({
      targetRoot: process.cwd(),
      resourcesRoot: bundledResourcesRoot(),
      ui: createClackUi(),
      loadCatalog,
      planInstallation,
      applyInstallationPlan,
    });
  },
});
