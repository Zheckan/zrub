#!/usr/bin/env node

import { bundledResourcesRoot } from './catalog/bundled-root.js';
import { loadCatalog } from './catalog/load-catalog.js';
import { createClackUi } from './cli/clack-ui.js';
import { runCli } from './cli/run-cli.js';
import { applyInstallationPlan } from './installer/apply-plan.js';
import { planInstallation } from './installer/plan-installation.js';

process.exitCode = await runCli({
  targetRoot: process.cwd(),
  resourcesRoot: bundledResourcesRoot(),
  ui: createClackUi(),
  loadCatalog,
  planInstallation,
  applyInstallationPlan,
});
