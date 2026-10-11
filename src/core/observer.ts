/** A single debounced observer; its own mutations happen while disconnected. */
export class ChapterObserver {
  private observer: MutationObserver;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active = false;
  constructor(private doc: Document, private process: () => void, relevant: (mutation: MutationRecord) => boolean) {
    this.observer = new MutationObserver(records => {
      // Inspect every record: later records may invalidate existing money metadata.
      let changed = false;
      for (const record of records) if (relevant(record)) changed = true;
      if (changed) this.schedule();
    });
  }
  start(): void {
    this.active = true;
    this.observe();
    this.doc.addEventListener('selectionchange', this.onSelection);
  }
  private onSelection = () => { if (this.doc.getSelection()?.isCollapsed) this.schedule(); };
  private observe(): void {
    if (this.active) this.observer.observe(this.doc.documentElement, {
      childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class'],
    });
  }
  schedule = (): void => {
    if (!this.active || this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.process();
    }, 80);
  };
  mutate(action: () => void): void {
    this.observer.disconnect();
    try { action(); } finally { this.observe(); }
  }
  stop(): void {
    this.active = false;
    this.observer.disconnect();
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.doc.removeEventListener('selectionchange', this.onSelection);
  }
}
