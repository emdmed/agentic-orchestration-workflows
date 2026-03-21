// Test: nested generics, mapped types, conditional types

import { Map as StdMap } from 'immutable';
import type { ReactNode } from 'react';

// Nested generics in type aliases
export type NestedMap = Map<string, Map<number, Array<Set<boolean>>>>;

// Conditional type
export type IsString<T> = T extends string ? true : false;

// Mapped type
export type Readonly<T> = {
  readonly [P in keyof T]: T[P];
};

// Interface with nested generics
export interface Repository<T extends Record<string, unknown>> {
  findAll(): Promise<Array<T>>;
  findById(id: string): Promise<T | null>;
  save(entity: T): Promise<void>;
}

// Function with generic params containing nested generics
export function mergeDeep<T extends Record<string, Map<string, Set<number>>>>(
  target: T,
  source: Partial<T>,
): T {
  return { ...target, ...source };
}

// Arrow function with complex generics
export const transform = <T, U extends Map<string, Array<T>>>(
  input: U,
  mapper: (item: T) => T,
): U => {
  return input;
};

// Class with generics
export class DataStore<K extends string, V extends Map<string, Array<number>>> {
  private store: Map<K, V>;

  constructor() {
    this.store = new Map();
  }

  get(key: K): V | undefined {
    return this.store.get(key);
  }

  set(key: K, value: V): void {
    this.store.set(key, value);
  }
}

// React component with generic props
export function GenericList<T extends { id: string; label: string }>({
  items,
  renderItem,
}: {
  items: Array<T>;
  renderItem: (item: T) => ReactNode;
}): ReactNode {
  return items.map(renderItem);
}
