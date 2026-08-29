import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const QUOTA_FILE = path.join(process.cwd(), 'data', 'daily-quota.json');

interface PersistedQuota {
  day: string;
  count: number;
}

function loadPersistedQuota(): PersistedQuota {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = fs.readFileSync(QUOTA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as PersistedQuota;
    if (parsed?.day === today && typeof parsed.count === 'number') {
      return { day: today, count: Math.max(0, parsed.count) };
    }
  } catch {
    // Missing or unreadable file — start fresh for today
  }
  return { day: today, count: 0 };
}

function persistQuota(state: PersistedQuota): void {
  try {
    fs.mkdirSync(path.dirname(QUOTA_FILE), { recursive: true });
    fs.writeFileSync(QUOTA_FILE, JSON.stringify(state), 'utf8');
  } catch (err) {
    console.warn('⚠️  Could not persist daily quota file:', err);
  }
}

export class RequestThrottler {
  private lastRequestTimestamp = 0;
  private dailyCount = 0;
  private currentDay = new Date().toISOString().slice(0, 10);
  private queue: Array<() => void> = [];
  private isProcessing = false;

  constructor() {
    const loaded = loadPersistedQuota();
    this.currentDay = loaded.day;
    this.dailyCount = loaded.count;
  }

  private checkAndResetDay(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.currentDay) {
      this.currentDay = today;
      this.dailyCount = 0;
      persistQuota({ day: this.currentDay, count: this.dailyCount });
    }
  }

  public getDailyQuota(): { cap: number; used_today: number; remaining: number } {
    this.checkAndResetDay();
    const remaining = Math.max(0, config.dailyRequestCap - this.dailyCount);
    return {
      cap: config.dailyRequestCap,
      used_today: this.dailyCount,
      remaining
    };
  }

  public canMakeRequest(): boolean {
    const quota = this.getDailyQuota();
    return quota.remaining > 0;
  }

  public recordRequest(): void {
    this.checkAndResetDay();
    this.dailyCount += 1;
    this.lastRequestTimestamp = Date.now();
    persistQuota({ day: this.currentDay, count: this.dailyCount });
  }

  public async acquireThrottledSlot(): Promise<void> {
    this.checkAndResetDay();

    if (!this.canMakeRequest()) {
      throw new Error(`DAILY_CAP_EXCEEDED: Hard daily request cap of ${config.dailyRequestCap} requests has been reached. Resets at midnight UTC.`);
    }

    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.executeThrottledRequest(resolve);
      });
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const nextTask = this.queue.shift();
    if (nextTask) {
      nextTask();
    }
  }

  private async executeThrottledRequest(resolve: () => void): Promise<void> {
    const now = Date.now();
    // Add randomized jitter (e.g. 1000ms - 3000ms) to reduce bot-detection patterns
    const jitterMs = Math.floor(Math.random() * 2500) + 750;
    const minDelayMs = config.requestCooldownSeconds * 1000 + jitterMs;
    const timeSinceLast = now - this.lastRequestTimestamp;

    if (this.lastRequestTimestamp > 0 && timeSinceLast < minDelayMs) {
      const waitTime = minDelayMs - timeSinceLast;
      await new Promise((r) => setTimeout(r, waitTime));
    }

    this.recordRequest();
    resolve();

    setTimeout(() => {
      this.processQueue();
    }, 100);
  }
}

export const requestThrottler = new RequestThrottler();
