export const RESOURCE_KINDS = [
  'guide',
  'prompt',
  'template',
  'example',
  'code',
] as const;

export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export type ExistingFilePolicy = 'managed-prepend-once';

export interface ResourceFileDefinition {
  source: string;
  destination: string;
  onExisting?: ExistingFilePolicy;
  existingSource?: string;
}

export interface ResourceDefinition {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  kind: ResourceKind;
  files: ResourceFileDefinition[];
}

export interface LoadedResourceFile extends ResourceFileDefinition {
  sourcePath: string;
  existingSourcePath?: string;
}

export interface LoadedResource extends ResourceDefinition {
  directoryPath: string;
  files: LoadedResourceFile[];
}
