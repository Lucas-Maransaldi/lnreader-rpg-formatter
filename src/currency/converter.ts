import { type Config, type ConvertibleCurrency, type ExchangeRate, validDate, validRate } from '../core/config';
import type { MoneyMatch } from './detector';

export const RATE_ENDPOINT = 'https://api.frankfurter.dev/v2/providers/ecb/rates?base=USD&quotes=KRW,EUR';
const CACHE_KEY = 'lnreader-rpg:rates:v1';
const TTL = 6 * 60 * 60 * 1000;
interface Cache {
  fetchedAt: number;
  rates: Partial<Record<ConvertibleCurrency, ExchangeRate>>;
}
export interface Conversion { usd: number; rate: ExchangeRate; source: 'manual' | 'Frankfurter / ECB' }

export function convertible(currency: string): currency is ConvertibleCurrency {
  return currency === 'KRW' || currency === 'EUR';
}

/** Runtime checks remain even when callers bypass TypeScript. */
export function convertToUSD(money: MoneyMatch, rate: ExchangeRate | null): number | null {
  if (!convertible(money.currency) || !validRate(rate) || !Number.isFinite(money.amount) || money.amount < 0) return null;
  const amount = money.amount * rate.value;
  return Number.isFinite(amount) && amount <= Number.MAX_SAFE_INTEGER ? amount : null;
}

export function parseRates(payload: unknown, now = Date.now()): Cache | null {
  if (!Array.isArray(payload)) return null;
  const rates: Cache['rates'] = {};
  for (const row of payload) {
    if (!row || row.base !== 'USD' || !convertible(row.quote) || typeof row.rate !== 'number' ||
        !Number.isFinite(row.rate) || row.rate <= 0 || !validDate(row.date) || row.date > new Date(now).toISOString().slice(0, 10)) return null;
    const code: ConvertibleCurrency = row.quote;
    const rate = { value: 1 / row.rate, date: row.date };
    if (!validRate(rate) || rates[code]) return null;
    rates[code] = rate;
  }
  return rates.KRW && rates.EUR ? { fetchedAt: now, rates } : null;
}

export class RateService {
  private cache: Cache | null = null;
  private storage: Storage | null = null;
  private pending: Promise<void> | null = null;
  private lastAttempt = -Infinity;
  constructor(private config: Config, private win: Window) {
    if (!config.onlineRates) return;
    // Storage may throw on opaque/file origins or be disabled by the host.
    try {
      const storage = win.localStorage;
      const probe = CACHE_KEY + ':probe';
      storage.setItem(probe, '1');
      if (storage.getItem(probe) !== '1') return;
      storage.removeItem(probe);
      this.storage = storage;
      const cached = JSON.parse(storage.getItem(CACHE_KEY) || 'null') as Cache | null;
      if (cached && typeof cached.fetchedAt === 'number' && cached.fetchedAt <= Date.now() &&
          cached.fetchedAt > 0 && validRate(cached.rates?.KRW) && validRate(cached.rates?.EUR) &&
          cached.rates.KRW.date && cached.rates.EUR.date &&
          cached.rates.KRW.date <= new Date().toISOString().slice(0, 10) &&
          cached.rates.EUR.date <= new Date().toISOString().slice(0, 10)) this.cache = cached;
    } catch { /* Reading still works with memory-only rates. */ }
  }

  get(money: MoneyMatch): Conversion | null {
    if (!convertible(money.currency)) return null;
    const manual = this.config.exchangeRates[money.currency];
    const rate = manual || this.cache?.rates[money.currency] || null;
    const usd = convertToUSD(money, rate);
    return usd === null || !rate ? null : { usd, rate, source: manual ? 'manual' : 'Frankfurter / ECB' };
  }

  refresh(): Promise<void> {
    if (!this.config.onlineRates || typeof this.win.fetch !== 'function') return Promise.resolve();
    if (this.pending) return this.pending;
    if (Date.now() - this.lastAttempt < 300000 || (this.cache && Date.now() - this.cache.fetchedAt < TTL)) return Promise.resolve();
    this.lastAttempt = Date.now();
    this.pending = this.fetchRates().then(() => { this.pending = null; }, () => { this.pending = null; });
    return this.pending;
  }

  private async fetchRates(): Promise<void> {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const request = this.win.fetch(RATE_ENDPOINT, {
        credentials: 'omit', referrerPolicy: 'no-referrer', ...(controller ? { signal: controller.signal } : {}),
      }).then(response => {
        if (!response.ok) throw new Error('Rate request failed');
        return response.json();
      });
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller?.abort(); reject(new Error('Rate timeout')); }, 5000);
      });
      const cache = parseRates(await Promise.race([request, timeout]));
      if (!cache) return;
      this.cache = cache;
      try { this.storage?.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* Quota/private mode. */ }
    } catch { /* Keep the last valid quote, including when offline. */ }
    finally { clearTimeout(timer); }
  }
}
