import path from 'node:path';

import {
  RESOURCE_KINDS,
  type ResourceDefinition,
  type ResourceFileDefinition,
} from './types.js';

const RESOURCE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[a-zA-Z]:\//;

function fail(message: string): never {
  throw new Error(`Invalid resource metadata: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(`${field} must be a non-empty string`);
  }
}

function validateRelativePath(
  value: unknown,
  field: string,
  allowDirectory: boolean,
): asserts value is string {
  requireNonEmptyString(value, field);

  if (value !== value.trim()) {
    fail(`${field} must not have surrounding whitespace`);
  }

  if (value.includes('\\') || value.includes('\0')) {
    fail(`${field} must use safe forward-slash paths`);
  }

  if (
    path.posix.isAbsolute(value) ||
    WINDOWS_ABSOLUTE_PATH_PATTERN.test(value)
  ) {
    fail(`${field} must be relative`);
  }

  const segments = value.split('/');
  if (segments.includes('..')) {
    fail(`${field} must not traverse outside its root`);
  }

  if (!allowDirectory && (value === '.' || value.endsWith('/'))) {
    fail(`${field} must identify a file`);
  }
}

function isMarkdownPath(value: string): boolean {
  const extension = path.posix.extname(value).toLowerCase();
  return extension === '.md' || extension === '.markdown';
}

function validateFile(
  value: unknown,
  resourceId: string,
  index: number,
): asserts value is ResourceFileDefinition {
  if (!isRecord(value)) {
    fail(`${resourceId}.files[${index}] must be an object`);
  }

  const prefix = `${resourceId}.files[${index}]`;
  validateRelativePath(value.source, `${prefix}.source`, false);
  validateRelativePath(value.destination, `${prefix}.destination`, true);

  if (
    value.onExisting !== undefined &&
    value.onExisting !== 'managed-prepend-once'
  ) {
    fail(`${prefix}.onExisting is not supported`);
  }

  if (value.onExisting === 'managed-prepend-once') {
    const resolvedDestination = value.destination.endsWith('/')
      ? value.source
      : value.destination;

    if (!isMarkdownPath(value.source) || !isMarkdownPath(resolvedDestination)) {
      fail(
        `${prefix}.onExisting requires Markdown source and destination files`,
      );
    }
  }
}

export function validateResourceDefinition(input: unknown): ResourceDefinition {
  if (!isRecord(input)) {
    fail('resource must be an object');
  }

  if (input.schemaVersion !== 1) {
    fail('schemaVersion must be 1');
  }

  requireNonEmptyString(input.id, 'id');
  if (!RESOURCE_ID_PATTERN.test(input.id)) {
    fail('id must be lowercase kebab-case');
  }
  const resourceId = input.id;

  requireNonEmptyString(input.name, `${resourceId}.name`);
  requireNonEmptyString(input.description, `${resourceId}.description`);

  if (
    typeof input.kind !== 'string' ||
    !RESOURCE_KINDS.some((kind) => kind === input.kind)
  ) {
    fail(`${resourceId}.kind is not supported`);
  }

  if (!Array.isArray(input.files) || input.files.length === 0) {
    fail(`${resourceId}.files must contain at least one file`);
  }

  input.files.forEach((file, index) => validateFile(file, resourceId, index));

  return input as unknown as ResourceDefinition;
}
