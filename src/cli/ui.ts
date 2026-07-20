import type { LoadedResource } from '../catalog/types.js';

export const CANCELLED = Symbol('cancelled');
export type Cancelled = typeof CANCELLED;

export interface ReviewGroup {
  heading: string;
  entries: string[];
  severity: 'normal' | 'warning' | 'blocking';
}

export interface UiPort {
  intro(title: string): void;
  selectResources(resources: LoadedResource[]): Promise<string[] | Cancelled>;
  showReview(groups: ReviewGroup[]): void;
  confirm(message: string): Promise<boolean | Cancelled>;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  outro(message: string): void;
}
