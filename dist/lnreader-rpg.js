/* LNReader RPG Formatter v0.3.0 | MIT
   Optional configuration, BEFORE this bundle:
   window.LNReaderRPGConfig = { theme: "classic", onlineRates: false };
   Manual rates: exchangeRates: { KRW: { value: YOUR_RATE, date: "YYYY-MM-DD" } }
   Values mean USD per 1 unit. No rate is supplied by default.
*/
"use strict";
(() => {
  // src/core/rarity-config.ts
  var DEFAULT_RARITY_PROFILE = {
    aliases: { common: "common", uncommon: "uncommon", rare: "rare", epic: "epic", unique: "unique", legendary: "legendary", mythic: "mythic" },
    fields: ["Item Rating", "Rating", "Rarity", "Grade"],
    itemNouns: [
      "item",
      "items",
      "equipment",
      "weapon",
      "weapons",
      "armor",
      "armour",
      "accessory",
      "accessories",
      "sword",
      "swords",
      "dagger",
      "daggers",
      "blade",
      "blades",
      "shield",
      "shields",
      "bow",
      "bows",
      "staff",
      "staves",
      "spear",
      "spears",
      "helmet",
      "helmets",
      "ring",
      "rings",
      "necklace",
      "necklaces",
      "boots",
      "gloves"
    ],
    // Empty overrides let the CSS variables supply the default palette.
    colors: {},
    themeColors: {}
  };
  var DEFAULT_RARITY_CONFIG = {
    enabled: true,
    profile: "default",
    profiles: { default: DEFAULT_RARITY_PROFILE }
  };
  function strings(input, fallback) {
    return Array.isArray(input) ? input.filter((v) => typeof v === "string" && /^[a-z][a-z -]{0,59}$/i.test(v)).slice(0, 100) : [...fallback];
  }
  function colors(input) {
    const result = {};
    if (input && typeof input === "object") for (const [key, value] of Object.entries(input)) {
      if (/^[a-z][a-z0-9-]{0,31}$/.test(key) && typeof value === "string" && /^#[\da-f]{6}$/i.test(value)) result[key] = value;
    }
    return result;
  }
  function profile(input, base) {
    var _a, _b;
    const aliases = {};
    for (const [term, rarity] of Object.entries((_a = input.aliases) != null ? _a : base.aliases)) {
      if (/^[a-z][a-z -]{0,59}$/i.test(term) && typeof rarity === "string" && /^[a-z][a-z0-9-]{0,31}$/.test(rarity)) aliases[term.toLowerCase()] = rarity;
    }
    const themeColors = {};
    for (const theme of ["classic", "medieval", "minimal"]) {
      themeColors[theme] = { ...colors(base.themeColors[theme]), ...colors((_b = input.themeColors) == null ? void 0 : _b[theme]) };
    }
    return {
      aliases,
      fields: strings(input.fields, base.fields),
      itemNouns: strings(input.itemNouns, base.itemNouns),
      colors: { ...colors(base.colors), ...colors(input.colors) },
      themeColors
    };
  }
  function resolveRarityConfig(input = {}, base = DEFAULT_RARITY_CONFIG) {
    const profiles = /* @__PURE__ */ Object.create(null);
    for (const [name, value] of Object.entries(base.profiles)) profiles[name] = profile({}, value);
    for (const [name, value] of Object.entries(input.profiles || {})) {
      if (/^[a-z][a-z0-9-]{0,39}$/i.test(name) && value && typeof value === "object") profiles[name] = profile(value, profiles[name] || DEFAULT_RARITY_PROFILE);
    }
    const selected = typeof input.profile === "string" && Object.prototype.hasOwnProperty.call(profiles, input.profile) ? input.profile : base.profile;
    return { enabled: typeof input.enabled === "boolean" ? input.enabled : base.enabled, profile: selected, profiles };
  }

  // src/core/config.ts
  var CONFIG = {
    theme: "classic",
    enabled: true,
    currencyHighlight: true,
    currencyConversion: true,
    rootSelector: "#LNReader-chapter",
    exchangeRates: { USD: 1, KRW: null, EUR: null },
    onlineRates: false,
    rarity: DEFAULT_RARITY_CONFIG
  };
  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = /* @__PURE__ */ new Date(value + "T00:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function validRate(rate) {
    if (!rate || typeof rate !== "object") return false;
    const r = rate;
    return typeof r.value === "number" && Number.isFinite(r.value) && r.value > 0 && (r.date === null || validDate(r.date));
  }
  function resolveConfig(input = {}, base = CONFIG) {
    var _a;
    const config = { ...base, exchangeRates: { ...base.exchangeRates }, rarity: resolveRarityConfig(input.rarity, base.rarity) };
    for (const code of ["KRW", "EUR"]) {
      if (config.exchangeRates[code]) config.exchangeRates[code] = { ...config.exchangeRates[code] };
    }
    if (["classic", "medieval", "minimal"].includes(input.theme || "")) config.theme = input.theme;
    for (const key of ["enabled", "currencyHighlight", "currencyConversion", "onlineRates"]) {
      if (typeof input[key] === "boolean") config[key] = input[key];
    }
    if (typeof input.rootSelector === "string" && input.rootSelector.trim()) {
      config.rootSelector = input.rootSelector;
    }
    for (const code of ["KRW", "EUR"]) {
      const rate = (_a = input.exchangeRates) == null ? void 0 : _a[code];
      if (rate === null || validRate(rate)) config.exchangeRates[code] = rate && { ...rate };
    }
    return config;
  }

  // src/currency/converter.ts
  var RATE_ENDPOINT = "https://api.frankfurter.dev/v2/providers/ecb/rates?base=USD&quotes=KRW,EUR";
  var CACHE_KEY = "lnreader-rpg:rates:v1";
  var TTL = 6 * 60 * 60 * 1e3;
  function convertible(currency) {
    return currency === "KRW" || currency === "EUR";
  }
  function convertToUSD(money, rate) {
    if (!convertible(money.currency) || !validRate(rate) || !Number.isFinite(money.amount) || money.amount < 0) return null;
    const amount = money.amount * rate.value;
    return Number.isFinite(amount) && amount <= Number.MAX_SAFE_INTEGER ? amount : null;
  }
  function parseRates(payload, now = Date.now()) {
    if (!Array.isArray(payload)) return null;
    const rates = {};
    for (const row of payload) {
      if (!row || row.base !== "USD" || !convertible(row.quote) || typeof row.rate !== "number" || !Number.isFinite(row.rate) || row.rate <= 0 || !validDate(row.date) || row.date > new Date(now).toISOString().slice(0, 10)) return null;
      const code = row.quote;
      const rate = { value: 1 / row.rate, date: row.date };
      if (!validRate(rate) || rates[code]) return null;
      rates[code] = rate;
    }
    return rates.KRW && rates.EUR ? { fetchedAt: now, rates } : null;
  }
  var RateService = class {
    constructor(config, win) {
      this.config = config;
      this.win = win;
      this.cache = null;
      this.storage = null;
      this.pending = null;
      this.lastAttempt = -Infinity;
      var _a, _b;
      if (!config.onlineRates) return;
      try {
        const storage = win.localStorage;
        const probe = CACHE_KEY + ":probe";
        storage.setItem(probe, "1");
        if (storage.getItem(probe) !== "1") return;
        storage.removeItem(probe);
        this.storage = storage;
        const cached = JSON.parse(storage.getItem(CACHE_KEY) || "null");
        if (cached && typeof cached.fetchedAt === "number" && cached.fetchedAt <= Date.now() && cached.fetchedAt > 0 && validRate((_a = cached.rates) == null ? void 0 : _a.KRW) && validRate((_b = cached.rates) == null ? void 0 : _b.EUR) && cached.rates.KRW.date && cached.rates.EUR.date && cached.rates.KRW.date <= (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) && cached.rates.EUR.date <= (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)) this.cache = cached;
      } catch (e) {
      }
    }
    get(money) {
      var _a;
      if (!convertible(money.currency)) return null;
      const manual = this.config.exchangeRates[money.currency];
      const rate = manual || ((_a = this.cache) == null ? void 0 : _a.rates[money.currency]) || null;
      const usd = convertToUSD(money, rate);
      return usd === null || !rate ? null : { usd, rate, source: manual ? "manual" : "Frankfurter / ECB" };
    }
    refresh() {
      if (!this.config.onlineRates || typeof this.win.fetch !== "function") return Promise.resolve();
      if (this.pending) return this.pending;
      if (Date.now() - this.lastAttempt < 3e5 || this.cache && Date.now() - this.cache.fetchedAt < TTL) return Promise.resolve();
      this.lastAttempt = Date.now();
      this.pending = this.fetchRates().then(() => {
        this.pending = null;
      }, () => {
        this.pending = null;
      });
      return this.pending;
    }
    async fetchRates() {
      var _a;
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      let timer;
      try {
        const request = this.win.fetch(RATE_ENDPOINT, {
          credentials: "omit",
          referrerPolicy: "no-referrer",
          ...controller ? { signal: controller.signal } : {}
        }).then((response) => {
          if (!response.ok) throw new Error("Rate request failed");
          return response.json();
        });
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller == null ? void 0 : controller.abort();
            reject(new Error("Rate timeout"));
          }, 5e3);
        });
        const cache = parseRates(await Promise.race([request, timeout]));
        if (!cache) return;
        this.cache = cache;
        try {
          (_a = this.storage) == null ? void 0 : _a.setItem(CACHE_KEY, JSON.stringify(cache));
        } catch (e) {
        }
      } catch (e) {
      } finally {
        clearTimeout(timer);
      }
    }
  };

  // src/core/dom-structure.ts
  var BLOCKS = "p,div,li,blockquote,pre,td,th,section,article,h1,h2,h3,h4,h5,h6";
  var EXCLUDED = 'script,style,noscript,textarea,input,select,button,a,code,svg,math,[contenteditable]:not([contenteditable="false"]),[data-rpg-ignore]';
  function neighbor(element, direction) {
    var _a;
    let node = element[direction];
    while (node && (node.nodeType === 8 || node.nodeType === 3 && !((_a = node.textContent) == null ? void 0 : _a.trim()))) node = node[direction];
    return (node == null ? void 0 : node.nodeType) === 1 ? node : null;
  }

  // src/currency/detector.ts
  var number = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?";
  var scaled = number + "(?:[ \\u00a0]+(?:thousand|million|billion))?";
  var units = "gold(?: coins?)?|silver(?: coins?)?|copper(?: coins?)?|(?:Korean |South Korean )?won|KRW|USD|euros?|EUR|(?:US )?dollars?";
  var expression = new RegExp("(?:[\u20A9\u20AC$][ \\u00a0]*" + scaled + "|" + scaled + "[ \\u00a0]+(?:" + units + "))", "gi");
  function detectMoney(text) {
    const matches = [];
    const regex = new RegExp(expression.source, "gi");
    let match;
    while (match = regex.exec(text)) {
      const raw = match[0];
      const previous = text[match.index - 1] || "";
      const next = text[regex.lastIndex] || "";
      if (/[\w.,+\-₩€$]/.test(previous) || /[\w]/.test(next) || /^[.,]\d/.test(text.slice(regex.lastIndex)) || /^[₩€$]/.test(raw) && new RegExp("^\\s+(?:" + units + ")\\b", "i").test(text.slice(regex.lastIndex))) continue;
      const digits = raw.match(new RegExp(number))[0];
      const scale = /\bbillion\b/i.test(raw) ? 1e9 : /\bmillion\b/i.test(raw) ? 1e6 : /\bthousand\b/i.test(raw) ? 1e3 : 1;
      const amount = Number(digits.replace(/,/g, "")) * scale;
      if (!Number.isFinite(amount) || amount > Number.MAX_SAFE_INTEGER) continue;
      let currency;
      if (/\bgold\b/i.test(raw)) currency = "gold";
      else if (/\bsilver\b/i.test(raw)) currency = "silver";
      else if (/\bcopper\b/i.test(raw)) currency = "copper";
      else if (/₩|\b(?:won|KRW)\b/i.test(raw)) currency = "KRW";
      else if (/€|\b(?:EUR|euros?)\b/i.test(raw)) currency = "EUR";
      else currency = "USD";
      matches.push({ start: match.index, end: regex.lastIndex, text: raw, amount, currency });
    }
    return matches;
  }

  // src/core/text-ranges.ts
  function readText(element) {
    let text = "";
    const segments = [];
    const walk = element.ownerDocument.createTreeWalker(element, 5);
    let node;
    while (node = walk.nextNode()) {
      if (node.nodeType === 3) {
        const value = node.nodeValue || "";
        segments.push({ node, start: text.length, end: text.length + value.length });
        text += value;
      } else if (node.tagName === "BR") text += "\n";
    }
    return { text, segments };
  }
  function inlineRuns(root, blocks, excluded) {
    const runs = [];
    let run = { text: "", segments: [] };
    const flush = () => {
      if (run.text) runs.push(run);
      run = { text: "", segments: [] };
    };
    const visit = (node) => {
      if (node.nodeType === 3) {
        const value = node.nodeValue || "";
        run.segments.push({ node, start: run.text.length, end: run.text.length + value.length });
        run.text += value;
      } else if (node.nodeType === 1) {
        const element = node;
        if (element.matches(excluded)) {
          flush();
          return;
        }
        const block = element.matches(blocks);
        if (block) flush();
        Array.from(element.childNodes).forEach(visit);
        if (block) flush();
      }
    };
    visit(root);
    flush();
    return runs;
  }
  function wrapTextRange(run, start, end, create) {
    const parts = run.segments.filter((segment) => segment.end > start && segment.start < end);
    const wrappers = [];
    for (let i = parts.length - 1; i >= 0; i--) {
      const segment = parts[i];
      const from = Math.max(0, start - segment.start);
      const to = Math.min(segment.node.length, end - segment.start);
      if (to < segment.node.length) segment.node.splitText(to);
      const selected = from > 0 ? segment.node.splitText(from) : segment.node;
      const span = create(i);
      selected.parentNode.insertBefore(span, selected);
      span.appendChild(selected);
      wrappers.push(span);
    }
    return wrappers;
  }

  // src/currency/highlighter.ts
  var sequence = 0;
  function highlightMoney(root, config, registry) {
    if (!config.currencyHighlight && !config.currencyConversion) return;
    for (const run of inlineRuns(root, BLOCKS, EXCLUDED + ",.rpg-money,br,img,hr")) {
      for (const money of detectMoney(run.text).reverse()) {
        const interactive = config.currencyConversion && convertible(money.currency);
        if (!config.currencyHighlight && !interactive) continue;
        const id = String(++sequence);
        registry.set(id, money);
        wrapTextRange(run, money.start, money.end, (i) => {
          const span = root.ownerDocument.createElement("span");
          span.className = "rpg-money";
          span.dataset.rpgMoney = id;
          span.dataset.rpgCurrency = money.currency;
          if (interactive) {
            span.dataset.rpgInteractive = "true";
            span.setAttribute("role", "button");
            span.tabIndex = i === 0 ? 0 : -1;
            span.setAttribute("aria-label", "Convert " + money.text + " to USD");
            span.setAttribute("aria-haspopup", "dialog");
          }
          return span;
        });
      }
    }
    const live = new Set(Array.from(root.querySelectorAll("[data-rpg-money]")).map((el) => el.dataset.rpgMoney));
    for (const id of registry.keys()) if (!live.has(id)) registry.delete(id);
  }

  // src/currency/popup.ts
  var CurrencyPopup = class {
    constructor(doc, config, rates, registry) {
      this.doc = doc;
      this.config = config;
      this.rates = rates;
      this.registry = registry;
      this.panel = null;
      this.trigger = null;
      this.root = null;
      this.click = (event) => {
        var _a, _b;
        const target = event.target;
        if ((_a = this.panel) == null ? void 0 : _a.contains(target)) {
          event.stopPropagation();
          if (target.closest(".rpg-popup-close")) this.close(true);
          return;
        }
        const money = this.moneyTarget(event.target);
        if (money) {
          if (!((_b = this.doc.getSelection()) == null ? void 0 : _b.isCollapsed)) return;
          event.stopPropagation();
          this.open(money, event.detail === 0);
        } else this.close();
      };
      this.keydown = (event) => {
        if (event.key === "Escape" && this.panel) {
          event.stopPropagation();
          this.close(true);
        }
        const target = this.moneyTarget(event.target);
        if (target && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          event.stopPropagation();
          this.open(target, true);
        }
      };
      doc.addEventListener("click", this.click, true);
      doc.addEventListener("keydown", this.keydown, true);
    }
    setRoot(root) {
      this.root = root;
    }
    moneyTarget(target) {
      var _a;
      const el = target instanceof Element ? target.closest('[data-rpg-interactive="true"]') : null;
      return el && ((_a = this.root) == null ? void 0 : _a.contains(el)) ? el : null;
    }
    open(trigger, keyboard) {
      var _a;
      const money = this.registry.get(trigger.dataset.rpgMoney);
      if (!money || !["KRW", "EUR"].includes(money.currency)) return;
      this.close();
      this.trigger = trigger;
      const panel = this.doc.createElement("aside");
      panel.className = "rpg-popup";
      panel.dataset.rpgTheme = this.config.theme;
      panel.dataset.rpgTone = ((_a = this.root) == null ? void 0 : _a.dataset.rpgTone) || "dark";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", "false");
      panel.setAttribute("aria-label", "Currency Conversion");
      const title = this.doc.createElement("strong");
      title.textContent = "Currency Conversion";
      const close = this.doc.createElement("button");
      close.type = "button";
      close.className = "rpg-popup-close";
      close.textContent = "\xD7";
      close.setAttribute("aria-label", "Close currency conversion");
      panel.append(title, close);
      const row = (label, value) => {
        const p = this.doc.createElement("p");
        const heading = this.doc.createElement("small");
        heading.textContent = label;
        p.append(heading, this.doc.createTextNode(value));
        panel.appendChild(p);
      };
      row("Original", money.text);
      const conversion = this.rates.get(money);
      if (conversion) {
        row("Converted", "\u2248 " + new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(conversion.usd) + " USD");
        row("Exchange Rate", "1 " + money.currency + " = " + Number(conversion.rate.value.toPrecision(8)).toString() + " USD");
        row("Rate Date", conversion.rate.date || "Not provided (manual rate)");
        row("Source", conversion.source);
      } else row("Converted", "Exchange rate unavailable.");
      this.panel = panel;
      this.doc.body.appendChild(panel);
      if (keyboard) close.focus({ preventScroll: true });
    }
    close(restoreFocus = false) {
      var _a, _b;
      (_a = this.panel) == null ? void 0 : _a.remove();
      this.panel = null;
      if (restoreFocus && ((_b = this.trigger) == null ? void 0 : _b.isConnected)) this.trigger.focus({ preventScroll: true });
      this.trigger = null;
    }
    destroy() {
      this.close();
      this.doc.removeEventListener("click", this.click, true);
      this.doc.removeEventListener("keydown", this.keydown, true);
    }
  };

  // src/detectors/item-rarity.ts
  function itemLines(text) {
    const lines = [];
    let offset = 0;
    for (const raw of text.split("\n")) {
      const content = raw.replace(/^[\s\[]+|[\s\]]+$/g, "");
      if (content) lines.push({ text: content, start: offset + raw.indexOf(content) });
      offset += raw.length + 1;
    }
    return lines;
  }
  function escape(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function alternatives(words) {
    return words.length ? words.sort((a, b) => b.length - a.length).map(escape).join("|") : "(?!)";
  }
  var patternCache = /* @__PURE__ */ new WeakMap();
  function patterns(profile2) {
    let result = patternCache.get(profile2);
    if (!result) {
      const aliases = alternatives(Object.keys(profile2.aliases));
      const fields = alternatives([...profile2.fields]);
      const nouns = alternatives([...profile2.itemNouns]);
      result = {
        field: new RegExp("^(?:" + fields + ")\\s*:\\s*(" + aliases + ")$", "i"),
        fieldLabel: new RegExp("^(?:" + fields + ")\\s*:", "i"),
        header: new RegExp("^(" + aliases + ")\\s+(?:" + nouns + ")(?:\\s*:\\s*(\\S.{0,140}))?$", "i"),
        context: "\\b(" + aliases + ")\\s+(" + nouns + ")\\b"
      };
      patternCache.set(profile2, result);
    }
    return result;
  }
  function isNonItemIdentity(text) {
    return itemLines(text).some((line) => /^(?:(?:skill(?: name| type| level)?|passive skills?|active skills?|class(?: name)?|title|profession|job)\s*:|skill (?:acquired|learned|level(?:ed)? up)\b)/i.test(line.text));
  }
  function itemNameLine(line) {
    return line.match(/^(?:item(?: name)?|weapon(?: name)?|armor(?: name)?|accessory(?: name)?)\s*:\s*(\S.{0,140})$/i);
  }
  function rarityField(line, profile2 = DEFAULT_RARITY_PROFILE) {
    return line.match(patterns(profile2).field);
  }
  function rarityHeader(line, profile2 = DEFAULT_RARITY_PROFILE) {
    return line.match(patterns(profile2).header);
  }
  function detectItemRarity(text, profile2 = DEFAULT_RARITY_PROFILE) {
    var _a, _b;
    if (!text.trim() || text.length > 6e3 || isNonItemIdentity(text)) return null;
    const fields = [];
    const headers = [];
    const names = [];
    for (const line of itemLines(text)) {
      const field = rarityField(line.text, profile2);
      if (!field && patterns(profile2).fieldLabel.test(line.text)) return null;
      const header = rarityHeader(line.text, profile2);
      const name2 = itemNameLine(line.text);
      if (field) {
        const start = line.start + line.text.lastIndexOf(field[1]);
        fields.push({ rarity: profile2.aliases[field[1].toLowerCase()], highlight: { start, end: start + field[1].length, part: "rarity" } });
      }
      if (header) {
        const headerEnd = header[2] ? line.text.indexOf(":") : line.text.length;
        const nameStart = header[2] ? line.start + line.text.lastIndexOf(header[2]) : 0;
        headers.push({
          rarity: profile2.aliases[header[1].toLowerCase()],
          highlight: { start: line.start, end: line.start + headerEnd, part: "header" },
          name: header[2],
          nameRange: header[2] ? { start: nameStart, end: nameStart + header[2].length, part: "name" } : void 0
        });
      }
      if (name2) {
        const start = line.start + line.text.lastIndexOf(name2[1]);
        names.push({ name: name2[1], highlight: { start, end: start + name2[1].length, part: "name" } });
      }
    }
    const candidates = fields.length ? fields : headers;
    const rarities = new Set(candidates.map((match) => match.rarity));
    if (rarities.size !== 1 || names.length + headers.filter((header) => header.name).length > 1) return null;
    const rarity = candidates[0].rarity;
    const matchingHeaders = headers.filter((header) => header.rarity === rarity);
    const name = ((_a = names[0]) == null ? void 0 : _a.name) || ((_b = matchingHeaders.find((header) => header.name)) == null ? void 0 : _b.name);
    return {
      rarity,
      itemName: name,
      confidence: fields.length ? 1 : 0.95,
      source: fields.length ? "explicit-field" : "header",
      highlights: [...fields.map((field) => field.highlight), ...matchingHeaders.reduce((all, header) => all.concat(header.nameRange ? [header.highlight, header.nameRange] : [header.highlight]), []), ...names.map((name2) => name2.highlight)]
    };
  }
  function detectContextualRarity(text, profile2 = DEFAULT_RARITY_PROFILE) {
    if (isNonItemIdentity(text)) return [];
    const regex = new RegExp(patterns(profile2).context, "gi");
    const results = [];
    let match;
    while (match = regex.exec(text)) {
      const before = text.slice(Math.max(0, match.index - 24), match.index);
      const after = text.slice(regex.lastIndex);
      if (/(?:\b(?:not|no|non|never)|["'“‘])\s*$/i.test(before) || /^[\s-]+(?:skill|master|mastery|warrior|class|title|technique|style|art|saint|king|knight|smith|craftsman|fighter)\b/i.test(after) || /^['’]s\b/i.test(after)) continue;
      results.push({
        rarity: profile2.aliases[match[1].toLowerCase()],
        confidence: 0.8,
        source: "context",
        highlights: [{ start: match.index, end: match.index + match[1].length, part: "rarity" }]
      });
    }
    return results;
  }

  // src/formatters/rarity-formatter.ts
  var managedStyles = /* @__PURE__ */ new WeakMap();
  function setStyle(element, name, value) {
    let original = managedStyles.get(element);
    if (!original) {
      original = /* @__PURE__ */ new Map();
      managedStyles.set(element, original);
    }
    if (!original.has(name)) original.set(name, { value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name) });
    if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
  }
  function restoreStyles(element) {
    var _a;
    (_a = managedStyles.get(element)) == null ? void 0 : _a.forEach((saved, name) => {
      if (saved.value) element.style.setProperty(name, saved.value, saved.priority);
      else element.style.removeProperty(name);
    });
    managedStyles.delete(element);
    if (element.hasAttribute("style") && !element.style.length) element.removeAttribute("style");
  }
  function clearWindow(element) {
    if (!element.hasAttribute("data-rpg-item-rarity")) return;
    element.removeAttribute("data-rpg-item-rarity");
    element.removeAttribute("data-rpg-rarity-source");
    element.removeAttribute("data-rpg-rarity-confidence");
    restoreStyles(element);
  }
  function unwrap(element) {
    element.querySelectorAll(".rpg-rarity").forEach((mark) => mark.replaceWith(...Array.from(mark.childNodes)));
  }
  function clearRarity(root) {
    unwrap(root);
    root.querySelectorAll("[data-rpg-item-rarity]").forEach(clearWindow);
    restoreStyles(root);
  }
  var RarityFormatter = class {
    constructor() {
      this.snapshots = /* @__PURE__ */ new WeakMap();
    }
    apply(root, config) {
      if (!config.rarity.enabled) {
        clearRarity(root);
        return;
      }
      const profile2 = config.rarity.profiles[config.rarity.profile];
      const palette = { ...profile2.colors, ...profile2.themeColors[config.theme] };
      for (const [rarity, color] of Object.entries(palette)) setStyle(root, "--rpg-rarity-" + rarity, color);
      const plans = /* @__PURE__ */ new Map();
      for (const element of Array.from(root.querySelectorAll(BLOCKS))) {
        if (element.querySelector(BLOCKS)) {
          clearWindow(element);
          continue;
        }
        if (element.closest(EXCLUDED) || element.querySelector(EXCLUDED)) {
          unwrap(element);
          clearWindow(element);
          continue;
        }
        plans.set(element, { text: readText(element).text, highlights: [] });
      }
      const groups = [];
      for (const element of plans.keys()) {
        if (element.dataset.rpgKind !== "item") continue;
        const group = groups[groups.length - 1];
        if (group && ["middle", "end"].includes(element.dataset.rpgGroup || "") && neighbor(element, "previousSibling") === group[group.length - 1]) group.push(element);
        else groups.push([element]);
      }
      for (const group of groups) {
        const match = detectItemRarity(group.map((element) => plans.get(element).text).join("\n"), profile2);
        if (!match) continue;
        let offset = 0;
        for (const element of group) {
          const plan = plans.get(element);
          plan.match = match;
          for (const highlight of match.highlights) {
            const start = Math.max(0, highlight.start - offset);
            const end = Math.min(plan.text.length, highlight.end - offset);
            if (end > start) plan.highlights.push({ start, end, part: highlight.part, rarity: match.rarity });
          }
          offset += plan.text.length + 1;
        }
      }
      for (const [element, plan] of plans) {
        if (element.dataset.rpgKind !== "item" && element.dataset.rpgKind !== "skill") {
          for (const match of detectContextualRarity(plan.text, profile2)) {
            plan.highlights.push(...match.highlights.map((highlight) => ({ ...highlight, rarity: match.rarity })));
          }
        }
        if (plan.match) {
          const attrs = {
            "data-rpg-item-rarity": plan.match.rarity,
            "data-rpg-rarity-source": plan.match.source,
            "data-rpg-rarity-confidence": String(plan.match.confidence)
          };
          for (const [name, value] of Object.entries(attrs)) if (element.getAttribute(name) !== value) element.setAttribute(name, value);
          setStyle(element, "--rpg-item-rarity-color", "var(--rpg-rarity-".concat(plan.match.rarity, ", var(--rpg-accent))"));
        } else clearWindow(element);
        const signature = JSON.stringify([plan.text, plan.highlights]);
        const snapshot = this.snapshots.get(element);
        if ((snapshot == null ? void 0 : snapshot.signature) === signature && snapshot.marks.every((mark) => element.contains(mark) && mark.classList.contains("rpg-rarity"))) continue;
        unwrap(element);
        const run = readText(element);
        run.segments = run.segments.filter((segment) => {
          var _a;
          return !((_a = segment.node.parentElement) == null ? void 0 : _a.closest(".rpg-money"));
        });
        const marks = [];
        for (const highlight of [...plan.highlights].sort((a, b) => b.start - a.start)) {
          marks.push(...wrapTextRange(run, highlight.start, highlight.end, () => {
            const span = root.ownerDocument.createElement("span");
            span.className = "rpg-rarity";
            span.dataset.rpgRarity = highlight.rarity;
            span.dataset.rpgRarityPart = highlight.part;
            span.style.setProperty("--rpg-rarity-color", "var(--rpg-rarity-".concat(highlight.rarity, ", var(--rpg-accent))"));
            return span;
          }));
        }
        this.snapshots.set(element, { signature, marks });
      }
    }
  };

  // src/themes/base.css?inline
  var base_default = '/* Scoped styles: no global paragraph, selection, body or reader UI overrides. */\n[data-rpg-theme] .rpg-window {\n  color: var(--rpg-fg);\n  background: var(--rpg-bg);\n  border-radius: 8px;\n  box-shadow: inset 3px 0 var(--rpg-border), inset -1px 0 var(--rpg-border), inset 0 1px var(--rpg-border), inset 0 -1px var(--rpg-border);\n  padding: .65em .85em;\n  text-align: start;\n  overflow-wrap: break-word;\n}\n[data-rpg-theme] .rpg-window[data-rpg-group="start"] { border-radius: 8px 8px 0 0; box-shadow: inset 3px 0 var(--rpg-border), inset -1px 0 var(--rpg-border), inset 0 1px var(--rpg-border); }\n[data-rpg-theme] .rpg-window[data-rpg-group="middle"] { border-radius: 0; box-shadow: inset 3px 0 var(--rpg-border), inset -1px 0 var(--rpg-border); }\n[data-rpg-theme] .rpg-window[data-rpg-group="end"] { border-radius: 0 0 8px 8px; box-shadow: inset 3px 0 var(--rpg-border), inset -1px 0 var(--rpg-border), inset 0 -1px var(--rpg-border); }\nbody:not(.page-reader) [data-rpg-theme] .rpg-window[data-rpg-group="start"], body:not(.page-reader) [data-rpg-theme] .rpg-window[data-rpg-group="middle"] { margin-bottom: 0; }\nbody:not(.page-reader) [data-rpg-theme] .rpg-window[data-rpg-group="end"], body:not(.page-reader) [data-rpg-theme] .rpg-window[data-rpg-group="middle"] { margin-top: 0; }\n[data-rpg-theme] .rpg-money { color: var(--rpg-accent); }\n[data-rpg-theme] [data-rpg-currency="gold"] { color: var(--rpg-gold); }\n[data-rpg-theme] [data-rpg-currency="silver"] { color: var(--rpg-silver); }\n[data-rpg-theme] [data-rpg-currency="copper"] { color: var(--rpg-copper); }\n/* Narrative money follows the reader\'s background, independently of window theme. */\n[data-rpg-tone="light"] .rpg-money { color: #285c88; }\n[data-rpg-tone="light"] [data-rpg-currency="gold"] { color: #795000; }\n[data-rpg-tone="light"] [data-rpg-currency="silver"] { color: #4c5665; }\n[data-rpg-tone="light"] [data-rpg-currency="copper"] { color: #8a4326; }\n[data-rpg-theme] .rpg-window .rpg-money { color: var(--rpg-accent); }\n[data-rpg-theme] .rpg-window [data-rpg-currency="gold"] { color: var(--rpg-gold); }\n[data-rpg-theme] .rpg-window [data-rpg-currency="silver"] { color: var(--rpg-silver); }\n[data-rpg-theme] .rpg-window [data-rpg-currency="copper"] { color: var(--rpg-copper); }\n[data-rpg-theme] [data-rpg-interactive="true"] { text-decoration: underline dotted; text-underline-offset: .18em; cursor: pointer; }\n[data-rpg-theme] [data-rpg-interactive="true"]:focus { outline: 2px solid var(--rpg-border); outline-offset: 2px; }\n.rpg-popup {\n  box-sizing: border-box;\n  position: fixed;\n  z-index: 10001;\n  left: 50%;\n  bottom: 18px;\n  transform: translateX(-50%);\n  width: calc(100% - 28px);\n  max-width: 360px;\n  max-height: 70vh;\n  overflow: auto;\n  padding: 20px;\n  border: 1px solid var(--rpg-border);\n  border-radius: 12px;\n  background: var(--rpg-bg);\n  color: var(--rpg-fg);\n  box-shadow: 0 8px 32px #0005;\n  font: 16px/1.5 system-ui, sans-serif;\n  text-align: start;\n  overflow-wrap: break-word;\n}\n.rpg-popup > strong { display: block; padding-right: 38px; color: var(--rpg-accent); }\n.rpg-popup p { margin: 14px 0 0; padding: 0; }\n.rpg-popup small { display: block; font-size: 12px; opacity: .8; }\n.rpg-popup-close { position: absolute; top: 6px; right: 6px; min-width: 44px; min-height: 44px; border: 0; background: transparent; color: inherit; font-size: 26px; cursor: pointer; }\n/* Avoid repagination from box padding in the host\'s horizontal column mode. */\n.page-reader [data-rpg-theme] .rpg-window { padding: 0; }\n.rpg-window .rpg-bracket {\n  font-size: 0;\n  line-height: 0;\n}';

  // src/themes/classic.css?inline
  var classic_default = '[data-rpg-theme="classic"] {\n  --rpg-bg: #102139;\n  --rpg-fg: #e9f5ff;\n  --rpg-border: #48b9ff;\n  --rpg-accent: #78d5ff;\n  --rpg-gold: #f5d477;\n  --rpg-silver: #d7e0ee;\n  --rpg-copper: #edb391;\n}\n\n[data-rpg-theme="classic"]\n.rpg-window[data-rpg-kind="system"] {\n  background: linear-gradient(\n    145deg,\n    #152c49,\n    #0c182b\n  );\n\n  color: #e9f5ff;\n\n  border: 0;\n  border-radius: 0;\n\n  padding: 0;\n  font-size: inherit;\n  line-height: inherit;\n\n  box-shadow:\n    inset 3px 0 0 #48b9ff,\n    inset -2px 0 0 #48b9ff;\n}\n\n[data-rpg-theme="classic"]\n.rpg-window[data-rpg-kind="system"][data-rpg-group="start"] {\n  border-radius: 10px 10px 0 0;\n\n  box-shadow:\n    inset 3px 0 0 #48b9ff,\n    inset -2px 0 0 #48b9ff,\n    inset 0 2px 0 #48b9ff;\n}\n\n[data-rpg-theme="classic"]\n.rpg-window[data-rpg-kind="system"][data-rpg-group="middle"] {\n  border-radius: 0;\n}\n\n[data-rpg-theme="classic"]\n.rpg-window[data-rpg-kind="system"][data-rpg-group="end"] {\n  border-radius: 0 0 10px 10px;\n\n  box-shadow:\n    inset 3px 0 0 #48b9ff,\n    inset -2px 0 0 #48b9ff,\n    inset 0 -2px 0 #48b9ff;\n}\n\n[data-rpg-theme="classic"]\n.rpg-window[data-rpg-kind="system"][data-rpg-group="single"] {\n  border-radius: 10px;\n\n  box-shadow:\n    inset 3px 0 0 #48b9ff,\n    inset -2px 0 0 #48b9ff,\n    inset 0 2px 0 #48b9ff,\n    inset 0 -2px 0 #48b9ff;\n}';

  // src/themes/medieval.css?inline
  var medieval_default = '[data-rpg-theme="medieval"] {\n  --rpg-bg: #2c211b;\n  --rpg-fg: #f5eadb;\n  --rpg-border: #b99b59;\n  --rpg-accent: #f1cf91;\n  --rpg-gold: #f4d375;\n  --rpg-silver: #deddda;\n  --rpg-copper: #f0b58b;\n}\n';

  // src/themes/minimal.css?inline
  var minimal_default = '[data-rpg-theme="minimal"] {\n  --rpg-bg: var(--readerSettings-theme, #f7f7f5);\n  --rpg-fg: var(--readerSettings-textColor, #242830);\n  --rpg-border: #858b94;\n  --rpg-accent: #275b85;\n  --rpg-gold: #795000;\n  --rpg-silver: #4c5665;\n  --rpg-copper: #8a4326;\n}\n[data-rpg-theme="minimal"][data-rpg-tone="dark"] {\n  --rpg-bg: var(--readerSettings-theme, #1c2026);\n  --rpg-fg: var(--readerSettings-textColor, #f2f3f5);\n  --rpg-accent: #a6cfff;\n  --rpg-gold: #f5d477;\n  --rpg-silver: #d7e0ee;\n  --rpg-copper: #edb391;\n}\n';

  // src/themes/rarity.css?inline
  var rarity_default = '/* Semantic colors, independent of rarity order and detector rules. */\n[data-rpg-theme] {\n  --rpg-rarity-common: #9CA3AF;\n  --rpg-rarity-uncommon: #22C55E;\n  --rpg-rarity-rare: #3B82F6;\n  --rpg-rarity-epic: #A855F7;\n  --rpg-rarity-unique: #F97316;\n  --rpg-rarity-legendary: #FACC15;\n  --rpg-rarity-mythic: #EF4444;\n  --rpg-rarity-text-background: #0b1018;\n}\n[data-rpg-theme] .rpg-window[data-rpg-item-rarity] {\n  --rpg-border: var(--rpg-item-rarity-color);\n}\n[data-rpg-theme] .rpg-rarity {\n  color: var(--rpg-rarity-color);\n  /* A quiet contrasting underlay preserves the requested hues on light themes too.\n     No padding, font-size, animations or glows that would change text geometry. */\n  background-color: var(--rpg-rarity-text-background);\n  border-radius: 2px;\n}\n[data-rpg-theme="medieval"] { --rpg-rarity-text-background: #160e09; }\n[data-rpg-theme="minimal"] { --rpg-rarity-text-background: #10151e; }\n[data-rpg-theme="minimal"][data-rpg-tone="light"] {\n  --rpg-rarity-common: #4B5563;\n  --rpg-rarity-uncommon: #15803D;\n  --rpg-rarity-rare: #1D4ED8;\n  --rpg-rarity-epic: #7E22CE;\n  --rpg-rarity-unique: #C2410C;\n  --rpg-rarity-legendary: #856000;\n  --rpg-rarity-mythic: #B91C1C;\n  --rpg-rarity-text-background: transparent;\n}\n';

  // src/detectors/items.ts
  var itemField = /^(?:item(?: name| effects?| requirements?)?|weapon(?:s| type)?|armor(?: type)?|accessor(?:y|ies)|rarity|grade|durability|attack(?: speed| power)?|defense|weight|requirements?|effects?|type|rating|price|value)\s*:\s*\S.{0,180}$/i;
  var itemAnchor = /^(?:(?:item(?: name| effects?| requirements?)?|weapon(?:s| type)?|armor(?: type)?|accessor(?:y|ies)|rarity|durability)\s*:|(?:type|rating)\s*:\s*(?:weapon|armor|accessory|sword|bow|staff|legendary|mythic|rare|epic|unique|normal)\b|(?:legendary|mythic) items?(?:\s*:|$))/i;
  function detectItem(lines, profile2 = DEFAULT_RARITY_PROFILE) {
    if (isNonItemIdentity(lines.join("\n"))) return false;
    return lines.some((line) => itemAnchor.test(line) || rarityField(line, profile2) || rarityHeader(line, profile2)) && lines.every((line) => itemField.test(line) || rarityField(line, profile2) || rarityHeader(line, profile2));
  }
  var itemContinuation = /^(?:effects?|requirements?|weight|attack(?: power| speed)?|defense|durability|price|value)\s*:\s*\S.{0,180}$/i;

  // src/detectors/quests.ts
  var questNotice = /^(?:quest (?:started|accepted|completed|failed|updated)|(?:you have )?(?:completed|accepted|failed) (?:the |a )?quest)\b[^\n]{0,160}$/i;
  var questField = /^(?:quest(?: name| difficulty)?|rewards?|penalt(?:y|ies)|objectives?)\s*:\s*\S.{0,180}$/i;
  function detectQuest(lines) {
    return lines.length > 0 && lines.every((line) => questNotice.test(line) || questField.test(line));
  }

  // src/detectors/skills.ts
  var skillNotice = /^(?:skill (?:acquired|level(?:ed)? up|learned)|(?:you have )?(?:acquired|learned) (?:a |the |a new )?skill)\b[^\n]{0,160}$/i;
  var skillField = /^(?:skill(?: name| level| type)?|passive skills?|active skills?|cooldowns?|mana costs?)\s*:\s*\S.{0,180}$/i;
  function detectSkill(lines) {
    return lines.length > 0 && lines.every((line) => skillNotice.test(line) || skillField.test(line));
  }

  // src/detectors/status.ts
  var statusLine = /^(?:strength|agility|intelligence|dexterity|stamina|hp|mp|level|experience|attack|defense)\s*:\s*[+\-]?\d[\d, ./%+\-]*(?:\s*\([^\n]{1,50}\))?\s*$/i;
  function detectStatus(lines) {
    return lines.length > 0 && lines.every((line) => statusLine.test(line));
  }

  // src/detectors/system.ts
  var notification = /^(?:you (?:have )?(?:leveled up|gained \d|received |obtained |lost \d)|your (?:strength|agility|intelligence|dexterity|stamina|hp|mp|level|experience|attack|defense) (?:has |have )?(?:increased|decreased)|achievement unlocked|level up)\b[^\n]{0,180}$/i;
  function isSystemNotification(text) {
    const raw = text.trim();
    if (raw.length < 3 || raw.length > 2e3 || !raw.startsWith("[") || !raw.endsWith("]")) {
      return false;
    }
    const content = raw.slice(1, -1).trim();
    if (!content) return false;
    if (content.includes("[") || content.includes("]")) {
      return false;
    }
    return true;
  }
  function detectWindow(text, previous = null, profile2 = DEFAULT_RARITY_PROFILE) {
    const raw = text.trim();
    if (!raw || raw.length > 2e3) return null;
    const bracketed = isSystemNotification(raw);
    const lines = raw.replace(/^\[|\]$/g, "").split(/\n+/).map(
      (line) => line.trim().replace(/^\[|\]$/g, "").trim()
    ).filter(Boolean);
    if (previous === "item" && lines.every((line) => itemContinuation.test(line))) {
      return "item";
    }
    if (previous === "skill" && lines.every((line) => rarityField(line, profile2))) {
      return "skill";
    }
    if (detectStatus(lines)) return "status";
    if (detectQuest(lines)) return "quest";
    if (detectSkill(lines)) return "skill";
    if (detectItem(lines, profile2)) return "item";
    if (bracketed && lines.every((line) => notification.test(line))) {
      return "system";
    }
    const systemPatterns = [
      /\b(?:quest|mission|achievement|event map)\b/i,
      /\b(?:stats|stat points|stamina|passive|skill)\b/i,
      /\b(?:class change|level up|experience points)\b/i,
      /\b(?:has|have|was|were|is|are)\s+(?:failed|completed|restored|destroyed|reduced|increased|lost|acquired|obtained)\b/i,
      /\b(?:you have|you gained|you received|you acquired)\b/i,
      /\b(?:war is considered to be lost)\b/i
    ];
    if (bracketed && systemPatterns.some((pattern) => pattern.test(raw.slice(1, -1)))) {
      return "system";
    }
    return null;
  }

  // src/core/dom.ts
  function blockText(element) {
    return readText(element).text;
  }
  function hideBrackets(element) {
    if (element.hasAttribute("data-rpg-brackets-hidden")) {
      return;
    }
    if (element.children.length > 0) {
      return;
    }
    const original = element.textContent || "";
    const trimmed = original.trim();
    if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
      return;
    }
    const start = original.indexOf("[");
    const end = original.lastIndexOf("]");
    if (start < 0 || end <= start) {
      return;
    }
    const before = original.slice(0, start);
    const content = original.slice(start + 1, end);
    const after = original.slice(end + 1);
    const opening = document.createElement("span");
    opening.className = "rpg-bracket";
    opening.textContent = "[";
    const closing = document.createElement("span");
    closing.className = "rpg-bracket";
    closing.textContent = "]";
    element.replaceChildren(
      document.createTextNode(before),
      opening,
      document.createTextNode(content),
      closing,
      document.createTextNode(after)
    );
    element.dataset.rpgBracketsHidden = "true";
  }
  function restoreBrackets(element) {
    if (!element.hasAttribute("data-rpg-brackets-hidden")) {
      return;
    }
    const text = element.textContent || "";
    element.replaceChildren(document.createTextNode(text));
    element.removeAttribute("data-rpg-brackets-hidden");
  }
  function decorateWindows(root, profile2 = DEFAULT_RARITY_PROFILE) {
    var _a;
    const elements = Array.from(root.querySelectorAll(BLOCKS));
    const kinds = /* @__PURE__ */ new Map();
    const texts = /* @__PURE__ */ new Map();
    for (const element of elements) {
      if (element.closest(EXCLUDED) || element.querySelector(BLOCKS) || element.querySelector(EXCLUDED)) {
        continue;
      }
      const previous = neighbor(element, "previousSibling");
      const text = (_a = element.getAttribute("data-rpg-original-text")) != null ? _a : blockText(element);
      texts.set(element, text);
      if (previous && isNonItemIdentity(blockText(previous)) && itemLines(text).every((line) => rarityField(line.text, profile2))) {
        continue;
      }
      const kind = detectWindow(
        text,
        previous ? kinds.get(previous) || null : null,
        profile2
      );
      if (kind) kinds.set(element, kind);
    }
    const joins = (before, after) => {
      if (!before || !after || !kinds.has(before) || kinds.get(before) !== kinds.get(after)) {
        return false;
      }
      if (kinds.get(before) !== "item") return true;
      const previous = itemLines(texts.get(before));
      const next = itemLines(texts.get(after));
      if (next.some((line) => rarityHeader(line.text, profile2))) {
        return false;
      }
      if (next.some((line) => itemNameLine(line.text))) {
        return previous.length === 1 && !!rarityHeader(previous[0].text, profile2) && !rarityHeader(previous[0].text, profile2)[2];
      }
      return true;
    };
    for (const element of elements) {
      const kind = kinds.get(element);
      if (!kind) {
        restoreBrackets(element);
        if (element.classList.contains("rpg-window")) {
          element.classList.remove("rpg-window");
          if (!element.className) {
            element.removeAttribute("class");
          }
          element.removeAttribute("data-rpg-kind");
          element.removeAttribute("data-rpg-group");
        }
        continue;
      }
      element.classList.add("rpg-window");
      element.dataset.rpgKind = kind;
      const before = neighbor(element, "previousSibling");
      const after = neighbor(element, "nextSibling");
      const joinedBefore = joins(before, element);
      const joinedAfter = joins(element, after);
      element.dataset.rpgGroup = joinedBefore ? joinedAfter ? "middle" : "end" : joinedAfter ? "start" : "single";
      if (kind === "system") {
        hideBrackets(element);
      } else {
        restoreBrackets(element);
      }
    }
  }
  function clearFormatting(root) {
    clearRarity(root);
    root.querySelectorAll(".rpg-window").forEach((element) => {
      restoreBrackets(element);
      element.classList.remove("rpg-window");
      if (!element.className) {
        element.removeAttribute("class");
      }
      element.removeAttribute("data-rpg-kind");
      element.removeAttribute("data-rpg-group");
    });
    root.querySelectorAll(".rpg-money").forEach(
      (element) => element.replaceWith(...Array.from(element.childNodes))
    );
    root.removeAttribute("data-rpg-theme");
    root.removeAttribute("data-rpg-tone");
  }
  function readingAnchor(root) {
    const win = root.ownerDocument.defaultView;
    if (root.ownerDocument.body.classList.contains("page-reader") || win.scrollY === 0) {
      return () => {
      };
    }
    const element = Array.from(root.querySelectorAll("p,li,blockquote")).find(
      (el) => {
        const box = el.getBoundingClientRect();
        return box.bottom > 0 && box.top < win.innerHeight;
      }
    );
    if (!element) return () => {
    };
    const top = element.getBoundingClientRect().top;
    return () => {
      if (!element.isConnected) return;
      const delta = element.getBoundingClientRect().top - top;
      if (Math.abs(delta) > 0.5) {
        const style = root.ownerDocument.documentElement.style;
        const old = style.getPropertyValue("scroll-behavior");
        const priority = style.getPropertyPriority("scroll-behavior");
        style.setProperty("scroll-behavior", "auto", "important");
        win.scrollBy(0, delta);
        if (old) {
          style.setProperty("scroll-behavior", old, priority);
        } else {
          style.removeProperty("scroll-behavior");
        }
      }
    };
  }

  // src/core/observer.ts
  var ChapterObserver = class {
    constructor(doc, process, relevant) {
      this.doc = doc;
      this.process = process;
      this.timer = null;
      this.active = false;
      this.onSelection = () => {
        var _a;
        if ((_a = this.doc.getSelection()) == null ? void 0 : _a.isCollapsed) this.schedule();
      };
      this.schedule = () => {
        if (!this.active || this.timer !== null) return;
        this.timer = setTimeout(() => {
          this.timer = null;
          this.process();
        }, 80);
      };
      this.observer = new MutationObserver((records) => {
        let changed = false;
        for (const record of records) if (relevant(record)) changed = true;
        if (changed) this.schedule();
      });
    }
    start() {
      this.active = true;
      this.observe();
      this.doc.addEventListener("selectionchange", this.onSelection);
    }
    observe() {
      if (this.active) this.observer.observe(this.doc.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["style", "class"]
      });
    }
    mutate(action) {
      this.observer.disconnect();
      try {
        action();
      } finally {
        this.observe();
      }
    }
    stop() {
      this.active = false;
      this.observer.disconnect();
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = null;
      this.doc.removeEventListener("selectionchange", this.onSelection);
    }
  };

  // src/core/bootstrap.ts
  var VERSION = "0.3.0";
  function tone(root, win) {
    var _a, _b;
    let element = root;
    while (element) {
      const color = win.getComputedStyle(element).backgroundColor;
      const values = (_a = color.match(/[\d.]+/g)) == null ? void 0 : _a.map(Number);
      if (values && values.length >= 3 && (values.length === 3 || values[3] > 0.5)) {
        const brightness = values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
        return brightness > 140 ? "light" : "dark";
      }
      element = element.parentElement;
    }
    return ((_b = win.matchMedia) == null ? void 0 : _b.call(win, "(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  }
  function bootstrap(win = window) {
    const existing = win.LNReaderRPG;
    if (existing) {
      if (existing.version === VERSION) {
        existing.refresh();
        return existing;
      }
      try {
        existing.destroy();
      } catch (error) {
        console.warn(
          "[LNReader RPG] Failed to destroy previous instance:",
          error
        );
      }
    }
    const doc = win.document;
    let config = resolveConfig(win.LNReaderRPGConfig);
    let root = null;
    const registry = /* @__PURE__ */ new Map();
    const rarity = new RarityFormatter();
    let rates = new RateService(config, win);
    let popup = new CurrencyPopup(doc, config, rates, registry);
    let destroyed = false;
    let needsReset = false;
    let started = false;
    let processing = false;
    let startup;
    let style = null;
    function findRoot() {
      try {
        return doc.querySelector(config.rootSelector);
      } catch (e) {
        return null;
      }
    }
    function ensureStyles() {
      if (style == null ? void 0 : style.isConnected) return;
      const existingStyle = doc.getElementById("lnreader-rpg-style");
      if (existingStyle instanceof HTMLStyleElement) {
        style = existingStyle;
        return;
      }
      style = doc.createElement("style");
      style.id = "lnreader-rpg-style";
      style.textContent = [classic_default, medieval_default, minimal_default, base_default, rarity_default].join(
        "\n"
      );
      (doc.head || doc.documentElement).appendChild(style);
    }
    function process() {
      if (destroyed || processing) return;
      const next = findRoot();
      const selection = doc.getSelection();
      if (selection && !selection.isCollapsed && ((next == null ? void 0 : next.contains(selection.anchorNode)) || (root == null ? void 0 : root.contains(selection.anchorNode)))) {
        return;
      }
      processing = true;
      try {
        observer.mutate(() => {
          if (root !== next) {
            if (root) clearFormatting(root);
            registry.clear();
            root = next;
            popup.close();
            popup.setRoot(root);
          }
          if (!root) return;
          const restore = readingAnchor(root);
          try {
            if (needsReset || !config.enabled) {
              clearFormatting(root);
              registry.clear();
              needsReset = false;
            }
            if (config.enabled) {
              ensureStyles();
              root.dataset.rpgTheme = config.theme;
              root.dataset.rpgTone = tone(root, win);
              decorateWindows(
                root,
                config.rarity.profiles[config.rarity.profile]
              );
              rarity.apply(root, config);
              highlightMoney(root, config, registry);
            }
          } finally {
            restore();
          }
        });
      } catch (error) {
        console.error("[LNReader RPG] Processing failed:", error);
      } finally {
        processing = false;
      }
    }
    const observer = new ChapterObserver(doc, process, (mutation) => {
      if (mutation.type === "attributes") {
        return mutation.target === doc.documentElement || mutation.target === doc.body || mutation.target === root;
      }
      const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
      if (target == null ? void 0 : target.closest("head style")) {
        return true;
      }
      if (root && (mutation.target === root || root.contains(mutation.target))) {
        if ((target == null ? void 0 : target.closest(".rpg-money")) || Array.from(mutation.addedNodes).some(
          (node) => node.nodeType === 1 && (node.matches(".rpg-money") || !!node.querySelector(".rpg-money"))
        )) {
          needsReset = true;
        }
        return true;
      }
      return findRoot() !== root;
    });
    const online = () => {
      void rates.refresh();
    };
    const start = () => {
      if (destroyed || started) return;
      started = true;
      observer.start();
      process();
      void rates.refresh();
      win.addEventListener("online", online);
    };
    const defer = () => {
      if (destroyed) return;
      clearTimeout(startup);
      startup = setTimeout(start, 0);
    };
    if (doc.readyState === "loading") {
      doc.addEventListener("DOMContentLoaded", defer, { once: true });
    } else {
      defer();
    }
    const api = {
      version: VERSION,
      refresh() {
        if (destroyed) return;
        if (!started) {
          start();
          return;
        }
        process();
      },
      configure(input) {
        config = resolveConfig(input, config);
        popup.destroy();
        rates = new RateService(config, win);
        popup = new CurrencyPopup(doc, config, rates, registry);
        popup.setRoot(root);
        needsReset = true;
        if (started) {
          process();
          void rates.refresh();
        }
      },
      getConfig() {
        return resolveConfig({}, config);
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        clearTimeout(startup);
        doc.removeEventListener("DOMContentLoaded", defer);
        observer.stop();
        win.removeEventListener("online", online);
        popup.destroy();
        if (root) {
          const restore = readingAnchor(root);
          clearFormatting(root);
          restore();
        }
        registry.clear();
        style == null ? void 0 : style.remove();
        style = null;
        root = null;
        if (win.LNReaderRPG === api) {
          delete win.LNReaderRPG;
        }
      }
    };
    win.LNReaderRPG = api;
    return api;
  }

  // src/index.ts
  bootstrap();
})();
