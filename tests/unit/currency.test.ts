import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveConfig } from '../../src/core/config';
import { convertToUSD, parseRates, RateService } from '../../src/currency/converter';
import { detectMoney } from '../../src/currency/detector';

// Deliberately synthetic rates for arithmetic tests, never distributed defaults.
const quote = { value: .001, date: '2025-01-02' };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); window.localStorage.clear(); });
describe('conversion isolation', () => {
  it.each(['50 gold', '50 silver', '50 copper', '$50'])('never converts %s', text => expect(convertToUSD(detectMoney(text)[0], quote)).toBeNull());
  it('converts only real foreign currencies', () => {
    expect(convertToUSD(detectMoney('1000 won')[0], quote)).toBe(1);
    expect(convertToUSD(detectMoney('€20')[0], { value: 2, date: null })).toBe(40);
  });
  it('does not invent missing/invalid rates', () => {
    const money = detectMoney('₩1000')[0];
    for (const rate of [null, { value: -1, date: null }, { value: Infinity, date: null }]) expect(convertToUSD(money, rate)).toBeNull();
    expect(new RateService(resolveConfig(), window).get(money)).toBeNull();
  });
  it('validates config and isolates returned rate objects', () => {
    const config = resolveConfig({ exchangeRates: { KRW: quote, EUR: { value: 1, date: '2025-02-31' } } });
    expect(config.exchangeRates.EUR).toBeNull();
    const copy = resolveConfig({}, config);
    copy.exchangeRates.KRW!.value = 300;
    expect(config.exchangeRates.KRW!.value).toBe(.001);
  });
});

const payload = [
  { base: 'USD', quote: 'KRW', rate: 1000, date: '2025-01-02' },
  { base: 'USD', quote: 'EUR', rate: .5, date: '2025-01-02' },
];
describe('optional rate provider', () => {
  it('inverts USD-base quotes and rejects bad or partial payloads', () => {
    expect(parseRates(payload)?.rates.KRW).toEqual(quote);
    expect(parseRates(payload.slice(0, 1))).toBeNull();
    expect(parseRates([{ ...payload[0], rate: 0 }, payload[1]])).toBeNull();
    expect(parseRates([{ ...payload[0], date: '2999-01-01' }, payload[1]])).toBeNull();
  });
  it('does no networking or storage access by default', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const storage = vi.spyOn(window, 'localStorage', 'get');
    await new RateService(resolveConfig(), window).refresh();
    expect(fetch).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled();
  });
  it('deduplicates requests, caches valid quotes, and reads them offline', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => payload }); vi.stubGlobal('fetch', fetch);
    const config = resolveConfig({ onlineRates: true });
    const service = new RateService(config, window);
    await Promise.all([service.refresh(), service.refresh()]);
    await service.refresh();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(service.get(detectMoney('1000 won')[0])?.usd).toBe(1);
    fetch.mockRejectedValue(new Error('offline'));
    const offline = new RateService(config, window);
    expect(offline.get(detectMoney('€20')[0])?.usd).toBe(40);
    await offline.refresh();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('survives disabled storage and a failed request', async () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('denied'); });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));
    const service = new RateService(resolveConfig({ onlineRates: true }), window);
    await service.refresh();
    expect(service.get(detectMoney('€20')[0])).toBeNull();
  });
  it('manual quotes take precedence over provider rates', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    const service = new RateService(resolveConfig({ onlineRates: true, exchangeRates: { EUR: { value: 3, date: null } } }), window);
    await service.refresh();
    expect(service.get(detectMoney('€20')[0])?.usd).toBe(60);
  });
});
