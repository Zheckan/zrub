export type ManagedBlockState =
  | { kind: 'absent' }
  | { kind: 'installed'; startIndex: number; endIndex: number }
  | { kind: 'malformed'; reason: string };

export function managedMarkers(resourceId: string): {
  start: string;
  end: string;
} {
  return {
    start: `<!-- zrub:${resourceId}:start -->`,
    end: `<!-- zrub:${resourceId}:end -->`,
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

function singleMarkerIndex(indexes: number[]): number | undefined {
  return indexes.length === 1 ? indexes[0] : undefined;
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

  const startIndex = singleMarkerIndex(startIndexes);
  const endMarkerIndex = singleMarkerIndex(endIndexes);
  if (startIndex === undefined || endMarkerIndex === undefined) {
    return {
      kind: 'malformed',
      reason: `Expected one start and one end marker, found ${startIndexes.length} start and ${endIndexes.length} end markers`,
    };
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
