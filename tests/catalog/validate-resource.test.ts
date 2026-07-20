import { describe, expect, it } from 'vitest';

import { validateResourceDefinition } from '../../src/catalog/validate-resource.js';

const validResource = {
  schemaVersion: 1,
  id: 'agents-project-guide',
  name: 'Agent project guide',
  description: 'Adds an editable project guide.',
  kind: 'template',
  files: [
    {
      source: 'AGENTS.md',
      destination: './',
      onExisting: 'managed-prepend-once',
    },
  ],
};

describe('validateResourceDefinition', () => {
  it('returns valid metadata unchanged', () => {
    expect(validateResourceDefinition(validResource)).toEqual(validResource);
  });

  it.each([
    ['non-object input', null],
    ['unsupported schema version', { ...validResource, schemaVersion: 2 }],
    ['malformed id', { ...validResource, id: 'Agent Guide' }],
    ['empty name', { ...validResource, name: '' }],
    ['empty description', { ...validResource, description: '   ' }],
    ['unknown kind', { ...validResource, kind: 'workflow' }],
    ['empty files', { ...validResource, files: [] }],
    [
      'absolute source',
      {
        ...validResource,
        files: [{ source: '/AGENTS.md', destination: './' }],
      },
    ],
    [
      'traversing source',
      {
        ...validResource,
        files: [{ source: '../AGENTS.md', destination: './' }],
      },
    ],
    [
      'backslash source',
      {
        ...validResource,
        files: [{ source: 'nested\\AGENTS.md', destination: './' }],
      },
    ],
    [
      'absolute destination',
      {
        ...validResource,
        files: [{ source: 'AGENTS.md', destination: '/AGENTS.md' }],
      },
    ],
    [
      'traversing destination',
      {
        ...validResource,
        files: [{ source: 'AGENTS.md', destination: 'docs/../AGENTS.md' }],
      },
    ],
    [
      'unknown existing-file policy',
      {
        ...validResource,
        files: [
          {
            source: 'AGENTS.md',
            destination: './',
            onExisting: 'overwrite',
          },
        ],
      },
    ],
    [
      'managed policy with non-Markdown source',
      {
        ...validResource,
        files: [
          {
            source: 'config.json',
            destination: './',
            onExisting: 'managed-prepend-once',
          },
        ],
      },
    ],
    [
      'managed policy with non-Markdown exact destination',
      {
        ...validResource,
        files: [
          {
            source: 'AGENTS.md',
            destination: 'config.json',
            onExisting: 'managed-prepend-once',
          },
        ],
      },
    ],
  ])('rejects %s', (_name, input) => {
    expect(() => validateResourceDefinition(input)).toThrowError(
      /^Invalid resource metadata:/,
    );
  });
});
