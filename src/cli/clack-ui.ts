import {
  confirm as clackConfirm,
  intro as clackIntro,
  isCancel as clackIsCancel,
  log as clackLog,
  multiselect as clackMultiselect,
  note as clackNote,
  outro as clackOutro,
} from '@clack/prompts';

import type { LoadedResource } from '../catalog/types.js';
import { CANCELLED, type UiPort } from './ui.js';

interface SelectOption {
  value: string;
  label: string;
  hint: string;
}

export interface ClackFunctions {
  intro(title?: string): void;
  outro(message?: string): void;
  multiselect(options: {
    message: string;
    options: SelectOption[];
    required?: boolean;
  }): Promise<string[] | symbol>;
  confirm(options: { message: string }): Promise<boolean | symbol>;
  isCancel(value: unknown): boolean;
  note(message?: string, title?: string): void;
  log: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
}

const defaultClack: ClackFunctions = {
  intro: clackIntro,
  outro: clackOutro,
  multiselect: clackMultiselect,
  confirm: clackConfirm,
  isCancel: clackIsCancel,
  note: clackNote,
  log: clackLog,
};

export function createClackUi(clack = defaultClack): UiPort {
  return {
    intro: (title) => clack.intro(title),
    async selectResources(resources: LoadedResource[]) {
      const selection = await clack.multiselect({
        message: 'Select resources to install',
        required: false,
        options: resources.map((resource) => ({
          value: resource.id,
          label: resource.name,
          hint: `${resource.kind} - ${resource.description}`,
        })),
      });

      if (clack.isCancel(selection)) {
        return CANCELLED;
      }

      return selection as string[];
    },
    showReview(groups) {
      for (const group of groups) {
        clack.note(group.entries.join('\n'), group.heading);
      }

      if (groups.some((group) => group.severity === 'warning')) {
        clack.log.warn('The review contains replacement conflicts.');
      }
      if (groups.some((group) => group.severity === 'blocking')) {
        clack.log.error('The review contains blocking conflicts.');
      }
    },
    async confirm(message) {
      const confirmation = await clack.confirm({ message });
      if (clack.isCancel(confirmation)) {
        return CANCELLED;
      }

      return confirmation as boolean;
    },
    info: (message) => clack.log.info(message),
    warn: (message) => clack.log.warn(message),
    error: (message) => clack.log.error(message),
    outro: (message) => clack.outro(message),
  };
}
