import { DEFAULT_RARITY_CONFIG, resolveRarityConfig, type RarityConfig, type RarityConfigInput } from './rarity-config';

export type RPGTheme = 'classic' | 'medieval' | 'minimal';
export type ConvertibleCurrency = 'KRW' | 'EUR';
export interface ExchangeRate { value: number; date: string | null }
export interface Config {
  theme: RPGTheme;
  enabled: boolean;
  currencyHighlight: boolean;
  currencyConversion: boolean;
  rootSelector: string;
  exchangeRates: { USD: 1; KRW: ExchangeRate | null; EUR: ExchangeRate | null };
  onlineRates: boolean;
  rarity: RarityConfig;
}
export type ConfigInput = Partial<Omit<Config, 'exchangeRates' | 'rarity'>> & {
  exchangeRates?: Partial<Config['exchangeRates']>;
  rarity?: RarityConfigInput;
};
export const CONFIG: Config = {
  theme: 'classic',
  enabled: true,
  currencyHighlight: true,
  currencyConversion: true,
  rootSelector: '#LNReader-chapter',
  exchangeRates: { USD: 1, KRW: null, EUR: null },
  onlineRates: false,
  rarity: DEFAULT_RARITY_CONFIG,
};

export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validRate(rate: unknown): rate is ExchangeRate {
  if (!rate || typeof rate !== 'object') return false;
  const r = rate as ExchangeRate;
  return typeof r.value === 'number' && Number.isFinite(r.value) && r.value > 0 &&
    (r.date === null || validDate(r.date));
}

export function resolveConfig(input: ConfigInput = {}, base: Config = CONFIG): Config {
  const config: Config = { ...base, exchangeRates: { ...base.exchangeRates }, rarity: resolveRarityConfig(input.rarity, base.rarity) };
  for (const code of ['KRW', 'EUR'] as const) {
    if (config.exchangeRates[code]) config.exchangeRates[code] = { ...config.exchangeRates[code]! };
  }
  if (['classic', 'medieval', 'minimal'].includes(input.theme || '')) config.theme = input.theme!;
  for (const key of ['enabled', 'currencyHighlight', 'currencyConversion', 'onlineRates'] as const) {
    if (typeof input[key] === 'boolean') config[key] = input[key];
  }
  if (typeof input.rootSelector === 'string' && input.rootSelector.trim()) {
    config.rootSelector = input.rootSelector;
  }
  for (const code of ['KRW', 'EUR'] as const) {
    const rate = input.exchangeRates?.[code];
    if (rate === null || validRate(rate)) config.exchangeRates[code] = rate && { ...rate };
  }
  return config;
}

