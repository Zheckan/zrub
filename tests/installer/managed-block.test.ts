import { describe, expect, it } from 'vitest';

import {
  inspectManagedBlock,
  managedMarkers,
  wrapManagedBlock,
} from '../../src/installer/managed-block.js';

const resourceId = 'agents-project-guide';
const markers = {
  start: '<!-- project-blueprints:agents-project-guide:start -->',
  end: '<!-- project-blueprints:agents-project-guide:end -->',
};

describe('managedMarkers', () => {
  it('creates stable resource-owned Markdown markers', () => {
    expect(managedMarkers(resourceId)).toEqual(markers);
  });
});

describe('wrapManagedBlock', () => {
  it.each(['## Project\n', '## Project'])(
    'normalizes one trailing newline around payload %j',
    (payload) => {
      expect(wrapManagedBlock(resourceId, payload)).toBe(
        `${markers.start}\n## Project\n${markers.end}\n`,
      );
    },
  );
});

describe('inspectManagedBlock', () => {
  it('classifies content without markers as absent', () => {
    expect(inspectManagedBlock(resourceId, '# Existing\n')).toEqual({
      kind: 'absent',
    });
  });

  it('finds exactly one complete block after user edits', () => {
    const content = `Before\n${markers.start}\nUser-edited findings\n${markers.end}\nAfter\n`;

    expect(inspectManagedBlock(resourceId, content)).toEqual({
      kind: 'installed',
      startIndex: content.indexOf(markers.start),
      endIndex: content.indexOf(markers.end) + markers.end.length,
    });
  });

  it.each([
    ['start without end', `${markers.start}\nPayload\n`],
    ['end without start', `Payload\n${markers.end}\n`],
    ['reversed markers', `${markers.end}\nPayload\n${markers.start}\n`],
    [
      'duplicate starts',
      `${markers.start}\n${markers.start}\nPayload\n${markers.end}\n`,
    ],
    [
      'duplicate ends',
      `${markers.start}\nPayload\n${markers.end}\n${markers.end}\n`,
    ],
    [
      'two complete blocks',
      `${markers.start}\nOne\n${markers.end}\n${markers.start}\nTwo\n${markers.end}\n`,
    ],
  ])('classifies %s as malformed', (_name, content) => {
    expect(inspectManagedBlock(resourceId, content)).toMatchObject({
      kind: 'malformed',
    });
  });
});
