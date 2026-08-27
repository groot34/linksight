import { config } from '../config.js';

export class RequestThrottler {
  private lastRequestTimestamp = 0;
  private dailyCount = 0;
  private currentDay = new Date().toISOString().slice(0, 10);
  private queue: Array<() => void> = [];
  private isProcessing = false;

  private checkAndResetDay(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.currentDay) {
      this.currentDay = today;
      this.dailyCount = 0;
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
