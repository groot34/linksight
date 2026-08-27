import { config } from '../config.js';
import { ProfileData } from '../types/index.js';

interface CacheEntry {
  data: ProfileData;
  cachedAt: string;
  expiresAt: number;
}

export class ProfileCache {
  private cache = new Map<string, CacheEntry>();

  public get(vanityName: string): { data: ProfileData; cachedAt: string } | null {
    const key = vanityName.toLowerCase().trim();
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return {
      data: entry.data,
      cachedAt: entry.cachedAt
    };
  }

  public set(vanityName: string, data: ProfileData): void {
    const key = vanityName.toLowerCase().trim();
    const now = Date.now();
    const ttlMs = config.cacheTtlHours * 60 * 60 * 1000;

    this.cache.set(key, {
      data,
      cachedAt: new Date(now).toISOString(),
      expiresAt: now + ttlMs
    });
  }

  public size(): number {
    return this.cache.size;
  }

  public clear(): void {
    this.cache.clear();
  }
}

export const profileCache = new ProfileCache();
