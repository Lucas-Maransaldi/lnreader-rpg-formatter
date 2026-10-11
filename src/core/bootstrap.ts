import { RateService } from '../currency/converter';
import { highlightMoney, type MoneyRegistry } from '../currency/highlighter';
import { CurrencyPopup } from '../currency/popup';
import { RarityFormatter } from '../formatters/rarity-formatter';
import base from '../themes/base.css?inline';
import classic from '../themes/classic.css?inline';
import medieval from '../themes/medieval.css?inline';
import minimal from '../themes/minimal.css?inline';
import rarityCSS from '../themes/rarity.css?inline';
import { resolveConfig, type Config, type ConfigInput } from './config';
import { clearFormatting, decorateWindows, readingAnchor } from './dom';
import { ChapterObserver } from './observer';

export const VERSION = '0.3.0';

export interface FormatterAPI {
  version: string;
  refresh(): void;
  configure(input: ConfigInput): void;
  getConfig(): Config;
  destroy(): void;
}

declare global {
  interface Window {
    LNReaderRPG?: FormatterAPI;
    LNReaderRPGConfig?: ConfigInput;
  }
}

function tone(root: HTMLElement, win: Window): 'light' | 'dark' {
  let element: HTMLElement | null = root;

  while (element) {
    const color = win.getComputedStyle(element).backgroundColor;
    const values = color.match(/[\d.]+/g)?.map(Number);

    if (
      values &&
      values.length >= 3 &&
      (values.length === 3 || values[3] > 0.5)
    ) {
      const brightness =
        values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;

      return brightness > 140 ? 'light' : 'dark';
    }

    element = element.parentElement;
  }

  return win.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function bootstrap(win: Window = window): FormatterAPI {
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
        '[LNReader RPG] Failed to destroy previous instance:',
        error,
      );
    }
  }

  const doc = win.document;

  let config = resolveConfig(win.LNReaderRPGConfig);
  let root: HTMLElement | null = null;

  const registry: MoneyRegistry = new Map();
  const rarity = new RarityFormatter();

  let rates = new RateService(config, win);
  let popup = new CurrencyPopup(doc, config, rates, registry);

  let destroyed = false;
  let needsReset = false;
  let started = false;
  let processing = false;

  let startup: ReturnType<typeof setTimeout> | undefined;
  let style: HTMLStyleElement | null = null;

  function findRoot(): HTMLElement | null {
    try {
      return doc.querySelector<HTMLElement>(config.rootSelector);
    } catch {
      return null;
    }
  }

  function ensureStyles(): void {
    if (style?.isConnected) return;

    const existingStyle = doc.getElementById('lnreader-rpg-style');

    if (existingStyle instanceof HTMLStyleElement) {
      style = existingStyle;
      return;
    }

    style = doc.createElement('style');
    style.id = 'lnreader-rpg-style';

    style.textContent = [classic, medieval, minimal, base, rarityCSS].join(
      '\n',
    );

    (doc.head || doc.documentElement).appendChild(style);
  }

  function process(): void {
    if (destroyed || processing) return;

    const next = findRoot();
    const selection = doc.getSelection();

    if (
      selection &&
      !selection.isCollapsed &&
      (next?.contains(selection.anchorNode) ||
        root?.contains(selection.anchorNode))
    ) {
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
              config.rarity.profiles[config.rarity.profile],
            );

            rarity.apply(root, config);

            highlightMoney(root, config, registry);
          }
        } finally {
          restore();
        }
      });
    } catch (error) {
      console.error('[LNReader RPG] Processing failed:', error);
    } finally {
      processing = false;
    }
  }

  const observer = new ChapterObserver(doc, process, (mutation) => {
    if (mutation.type === 'attributes') {
      return (
        mutation.target === doc.documentElement ||
        mutation.target === doc.body ||
        mutation.target === root
      );
    }

    const target =
      mutation.target.nodeType === 1
        ? (mutation.target as Element)
        : mutation.target.parentElement;

    if (target?.closest('head style')) {
      return true;
    }

    if (root && (mutation.target === root || root.contains(mutation.target))) {
      if (
        target?.closest('.rpg-money') ||
        Array.from(mutation.addedNodes).some(
          (node) =>
            node.nodeType === 1 &&
            ((node as Element).matches('.rpg-money') ||
              !!(node as Element).querySelector('.rpg-money')),
        )
      ) {
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

    win.addEventListener('online', online);
  };

  const defer = () => {
    if (destroyed) return;

    clearTimeout(startup);

    startup = setTimeout(start, 0);
  };

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', defer, { once: true });
  } else {
    defer();
  }

  const api: FormatterAPI = {
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

      doc.removeEventListener('DOMContentLoaded', defer);

      observer.stop();

      win.removeEventListener('online', online);

      popup.destroy();

      if (root) {
        const restore = readingAnchor(root);

        clearFormatting(root);
        restore();
      }

      registry.clear();

      style?.remove();
      style = null;

      root = null;

      if (win.LNReaderRPG === api) {
        delete win.LNReaderRPG;
      }
    },
  };

  win.LNReaderRPG = api;

  return api;
}
