export type ManagedBlockState =
  | { kind: 'absent' }
  | { kind: 'installed'; startIndex: number; endIndex: number }
  | { kind: 'malformed'; reason: string };

export function managedMarkers(resourceId: string): {
  start: string;
  end: string;
} {
  return {
    start: `<!-- project-blueprints:${resourceId}:start -->`,
    end: `<!-- project-blueprints:${resourceId}:end -->`,
  };
}

export function wrapManagedBlock(resourceId: string, content: string): string {
  const { start, end } = managedMarkers(resourceId);
  const normalized = content.endsWith('\n') ? content : `${content}\n`;
  return `${start}\n${normalized}${end}\n`;
}

function markerIndexes(content: string, marker: string): number[] {
  const indexes: number[] = [];
  let searchFrom = 0;

  while (searchFrom < content.length) {
    const index = content.indexOf(marker, searchFrom);
    if (index === -1) {
      break;
    }
    indexes.push(index);
    searchFrom = index + marker.length;
  }

  return indexes;
}

export function inspectManagedBlock(
  resourceId: string,
  content: string,
): ManagedBlockState {
  const { start, end } = managedMarkers(resourceId);
  const startIndexes = markerIndexes(content, start);
  const endIndexes = markerIndexes(content, end);

  if (startIndexes.length === 0 && endIndexes.length === 0) {
    return { kind: 'absent' };
  }

  if (startIndexes.length !== 1 || endIndexes.length !== 1) {
    return {
      kind: 'malformed',
      reason: `Expected one start and one end marker, found ${startIndexes.length} start and ${endIndexes.length} end markers`,
    };
  }

  const startIndex = startIndexes[0];
  const endMarkerIndex = endIndexes[0];
  if (startIndex === undefined || endMarkerIndex === undefined) {
    throw new Error('Managed marker inspection invariant failed');
  }

  if (startIndex > endMarkerIndex) {
    return {
      kind: 'malformed',
      reason: 'The end marker appears before the start marker',
    };
  }

  return {
    kind: 'installed',
    startIndex,
    endIndex: endMarkerIndex + end.length,
  };
}
