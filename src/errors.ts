export function isMissingPath(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
