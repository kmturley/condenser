/// <reference lib="dom" />

import { findInElementTree, findInFiberTree, getReactFiberRoot } from './tree.js';
import { getCondenser } from './condenser.js';

export function wrapReturnValue(
  object: any,
  property: string,
  handler: (args: any[], returnValue: any) => any,
): void {
  const original = object[property];
  object[property] = function(this: any, ...args: any[]) {
    return handler.call(this, args, original.call(this, ...args));
  };
  object[property].toString = () => original.toString();
}

export function renderComponent(id: string): void {
  const condenser = getCondenser();
  const def = condenser.components[id]?.component;
  if (!def?.target) return;
  if (def.target === 'quick-access-menu') activateQuickAccessMenu();
}

export function activateQuickAccessMenu(): void {
  const condenser = getCondenser();
  if (condenser.core.patched) return;
  condenser.core.patched = true;

  const renderer = condenser.core.quickAccessMenuRenderer;
  if (!renderer) return;

  const patchedTypeCache: Map<any, any> =
    condenser.core.patchedTypeCache ?? (condenser.core.patchedTypeCache = new Map());

  wrapReturnValue(renderer, 'type', (_outerArgs: any[], outerReturnValue: any) => {
    const innerElement = findInElementTree(outerReturnValue, (x: any) => x?.props?.onFocusNavDeactivated !== undefined);
    if (innerElement) {
      const cached = patchedTypeCache.get(innerElement.type);
      if (cached) {
        innerElement.type = cached;
      } else {
        const originalType = innerElement.type;
        if (typeof originalType === 'function') {
          wrapReturnValue(innerElement, 'type', appendTab('quick-access-menu'));
        }
        patchedTypeCache.set(originalType, innerElement.type);
      }
    }
    return outerReturnValue;
  });

  const rootElement = document.getElementById('root');
  const fiberRoot = rootElement ? getReactFiberRoot(rootElement) : null;
  const qamFiberNode = fiberRoot
    ? findInFiberTree(fiberRoot, (n: any) => n.elementType === renderer)
    : null;
  if (qamFiberNode) {
    qamFiberNode.type = qamFiberNode.elementType.type;
    if (qamFiberNode.alternate) qamFiberNode.alternate.type = qamFiberNode.type;
  }
}

export function appendTab(
  target: string,
): (args: any[], returnValue: any) => any {
  const condenser = getCondenser();
  const React = condenser.core.React;
  let titleClassName = '';

  function InjectedTabPanel(props: any) {
    const R = condenser.core.React;
    const [, setTick] = R.useState(0);
    const ns = (condenser.components[props.id] ||= {});
    R.useLayoutEffect(() => {
      ns.forceUpdate = () => setTick((t: number) => t + 1);
      return () => { ns.forceUpdate = undefined; };
    }, []);
    const Panel = ns.component?.panel;
    return Panel ? R.createElement(Panel, { websocketUrl: condenser.core.url }) : null;
  }

  return function(_args: any[], returnValue: any): any {
    const tabsNode = findInElementTree(returnValue, (x: any) => Array.isArray(x?.props?.tabs));
    if (!tabsNode) return returnValue;

    for (const [id, ns] of Object.entries(condenser.components as Record<string, any>)) {
      const def = ns?.component;
      if (!def || def.target !== target) continue;
      if (tabsNode.props.tabs.some((t: any) => t.key === def.key)) continue;

      if (!titleClassName) {
        const nativeTitleType = tabsNode.props.tabs[0]?.title?.type;
        const sample = typeof nativeTitleType === 'function' ? nativeTitleType({ locId: '' }) : null;
        titleClassName = sample?.props?.className ?? '';
      }

      tabsNode.props.tabs.push({
        key: def.key,
        tab: def.tab(React),
        initialVisibility: false,
        panel: React.createElement(InjectedTabPanel, { id }),
        title: titleClassName
          ? React.createElement('div', { className: titleClassName }, def.title ?? def.key)
          : def.tab(React),
      });
    }

    return returnValue;
  };
}
