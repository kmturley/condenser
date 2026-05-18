/// <reference lib="dom" />

function findInTree(node: any, filter: (n: any) => boolean, walkKeys: string[]): any {
  if (!node || typeof node !== 'object') return null;
  if (filter(node)) return node;
  if (Array.isArray(node)) return node.map((x: any) => findInTree(x, filter, walkKeys)).find(Boolean) ?? null;
  return walkKeys.map(k => findInTree(node[k], filter, walkKeys)).find(Boolean) ?? null;
}

export function findInFiberTree(node: any, filter: (n: any) => boolean): any {
  return findInTree(node, filter, ['child', 'sibling']);
}

export function findInElementTree(node: any, filter: (n: any) => boolean): any {
  return findInTree(node, filter, ['props', 'children', 'child', 'sibling']);
}

export function getReactFiberRoot(element: any): any {
  const key = Object.keys(element).find((k: string) => k.startsWith('__reactContainer$'));
  return key ? element[key] : element['_reactRootContainer']?._internalRoot?.current;
}
