export interface TextSegment { node: Text; start: number; end: number }
export interface TextRun { text: string; segments: TextSegment[] }

/** Map text offsets back to original nodes; wrappers never extract or clone markup. */
export function readText(element: Element): TextRun {
  let text = '';
  const segments: TextSegment[] = [];
  const walk = element.ownerDocument.createTreeWalker(element, 5);
  let node: Node | null;
  while ((node = walk.nextNode())) {
    if (node.nodeType === 3) {
      const value = node.nodeValue || '';
      segments.push({ node: node as Text, start: text.length, end: text.length + value.length });
      text += value;
    } else if ((node as Element).tagName === 'BR') text += '\n';
  }
  return { text, segments };
}

export function inlineRuns(root: HTMLElement, blocks: string, excluded: string): TextRun[] {
  const runs: TextRun[] = [];
  let run: TextRun = { text: '', segments: [] };
  const flush = () => { if (run.text) runs.push(run); run = { text: '', segments: [] }; };
  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      const value = node.nodeValue || '';
      run.segments.push({ node: node as Text, start: run.text.length, end: run.text.length + value.length });
      run.text += value;
    } else if (node.nodeType === 1) {
      const element = node as Element;
      if (element.matches(excluded)) { flush(); return; }
      const block = element.matches(blocks);
      if (block) flush();
      Array.from(element.childNodes).forEach(visit);
      if (block) flush();
    }
  };
  visit(root); flush();
  return runs;
}

/** Call from the last match toward the first so original offsets stay valid. */
export function wrapTextRange(run: TextRun, start: number, end: number, create: (part: number) => HTMLElement): HTMLElement[] {
  const parts = run.segments.filter(segment => segment.end > start && segment.start < end);
  const wrappers: HTMLElement[] = [];
  for (let i = parts.length - 1; i >= 0; i--) {
    const segment = parts[i];
    const from = Math.max(0, start - segment.start);
    const to = Math.min(segment.node.length, end - segment.start);
    if (to < segment.node.length) segment.node.splitText(to);
    const selected = from > 0 ? segment.node.splitText(from) : segment.node;
    const span = create(i);
    selected.parentNode!.insertBefore(span, selected);
    span.appendChild(selected);
    wrappers.push(span);
  }
  return wrappers;
}
