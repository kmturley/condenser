import type { BackendAPI } from '../../backend/plugin-loader.js';

let clickCount = 0;

export function onLoad(_api: BackendAPI): void {
  clickCount = 0;
}

export function onUnload(): void {}

export function onMessage(
  action: string,
  _data: unknown,
  respond: (result: unknown) => void,
): void {
  if (action === 'get-count') {
    respond({ count: clickCount });
  } else if (action === 'click') {
    respond({ count: ++clickCount });
  }
}
