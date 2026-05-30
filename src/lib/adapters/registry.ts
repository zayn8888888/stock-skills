/**
 * Central registry for data source adapters.
 *
 * Adapters register themselves at startup; consumers look them up by
 * name or iterate over all registered adapters.
 */

import type { DataSourceAdapter, SourceHealth } from "./base";

export class AdapterRegistry {
  private adapters = new Map<string, DataSourceAdapter>();

  /** Register an adapter. Throws if an adapter with the same name already exists. */
  register(adapter: DataSourceAdapter): void {
    if (this.adapters.has(adapter.name)) {
      throw new Error(
        `Adapter "${adapter.name}" is already registered. Use a unique name.`
      );
    }
    this.adapters.set(adapter.name, adapter);
  }

  /** Retrieve an adapter by name. Returns undefined if not found. */
  get(name: string): DataSourceAdapter | undefined {
    return this.adapters.get(name);
  }

  /** Return all registered adapters as an array. */
  list(): DataSourceAdapter[] {
    return Array.from(this.adapters.values());
  }

  /** Run healthCheck() on every registered adapter in parallel. */
  async healthCheckAll(): Promise<SourceHealth[]> {
    const checks = this.list().map((adapter) => adapter.healthCheck());
    return Promise.all(checks);
  }
}

/** Singleton registry instance for the application. */
export const registry = new AdapterRegistry();
