export type CurrencyCode = 'gold' | 'silver' | 'copper' | 'KRW' | 'EUR' | 'USD';
export interface MoneyMatch {
  start: number;
  end: number;
  text: string;
  amount: number;
  currency: CurrencyCode;
}
const number = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?';
const scaled = number + '(?:[ \\u00a0]+(?:thousand|million|billion))?';
const units = 'gold(?: coins?)?|silver(?: coins?)?|copper(?: coins?)?|(?:Korean |South Korean )?won|KRW|USD|euros?|EUR|(?:US )?dollars?';
const expression = new RegExp('(?:[₩€$][ \\u00a0]*' + scaled + '|' + scaled + '[ \\u00a0]+(?:' + units + '))', 'gi');

export function detectMoney(text: string): MoneyMatch[] {
  const matches: MoneyMatch[] = [];
  const regex = new RegExp(expression.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const raw = match[0];
    const previous = text[match.index - 1] || '';
    const next = text[regex.lastIndex] || '';
    // Reject malformed grouping, identifiers, signed values and ambiguous mixed units.
    if (/[\w.,+\-₩€$]/.test(previous) || /[\w]/.test(next) ||
        /^[.,]\d/.test(text.slice(regex.lastIndex)) ||
        (/^[₩€$]/.test(raw) && new RegExp('^\\s+(?:' + units + ')\\b', 'i').test(text.slice(regex.lastIndex)))) continue;
    const digits = raw.match(new RegExp(number))![0];
    const scale = /\bbillion\b/i.test(raw) ? 1e9 : /\bmillion\b/i.test(raw) ? 1e6 : /\bthousand\b/i.test(raw) ? 1e3 : 1;
    const amount = Number(digits.replace(/,/g, '')) * scale;
    if (!Number.isFinite(amount) || amount > Number.MAX_SAFE_INTEGER) continue;
    let currency: CurrencyCode;
    if (/\bgold\b/i.test(raw)) currency = 'gold';
    else if (/\bsilver\b/i.test(raw)) currency = 'silver';
    else if (/\bcopper\b/i.test(raw)) currency = 'copper';
    else if (/₩|\b(?:won|KRW)\b/i.test(raw)) currency = 'KRW';
    else if (/€|\b(?:EUR|euros?)\b/i.test(raw)) currency = 'EUR';
    else currency = 'USD';
    matches.push({ start: match.index, end: regex.lastIndex, text: raw, amount, currency });
  }
  return matches;
}
