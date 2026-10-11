export const BLOCKS = 'p,div,li,blockquote,pre,td,th,section,article,h1,h2,h3,h4,h5,h6';
export const EXCLUDED = 'script,style,noscript,textarea,input,select,button,a,code,svg,math,[contenteditable]:not([contenteditable="false"]),[data-rpg-ignore]';

export function neighbor(element: Element, direction: 'previousSibling' | 'nextSibling'): Element | null {
  let node = element[direction];
  while (node && (node.nodeType === 8 || (node.nodeType === 3 && !node.textContent?.trim()))) node = node[direction];
  return node?.nodeType === 1 ? node as Element : null;
}
