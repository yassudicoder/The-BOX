export function $$(root: ParentNode, selector: string): Element[] {
  return Array.from(root.querySelectorAll(selector));
}

export function $(root: ParentNode, selector: string): Element | null {
  return root.querySelector(selector);
}

export function textOf(el: Element | null | undefined): string {
  return el?.textContent?.trim() ?? '';
}

/**
 * Cheap stable fingerprint of an element's structural class names.
 * Used to detect when a host platform's DOM has drifted enough that selectors
 * may need updating. Not cryptographic — collisions are fine.
 */
export function fingerprintClasses(root: Element, maxNodes = 50): string {
  const classes: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let count = 0;
  let node = walker.currentNode as Element | null;
  while (node && count < maxNodes) {
    if (node.classList && node.classList.length > 0) {
      classes.push(Array.from(node.classList).sort().join('.'));
      count++;
    }
    node = walker.nextNode() as Element | null;
  }
  let h = 5381;
  const joined = classes.join('|');
  for (let i = 0; i < joined.length; i++) {
    h = ((h << 5) + h + joined.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}
