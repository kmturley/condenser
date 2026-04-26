export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export function createLogger(scope: string, enabled = true): Logger {
  const prefix = `[${scope}]`;

  return {
    debug: (...args: unknown[]) => {
      if (enabled) {
        console.log(prefix, ...args);
      }
    },
    info: (...args: unknown[]) => {
      if (enabled) {
        console.log(prefix, ...args);
      }
    },
    warn: (...args: unknown[]) => {
      if (enabled) {
        console.warn(prefix, ...args);
      }
    },
    error: (...args: unknown[]) => {
      if (enabled) {
        console.error(prefix, ...args);
      }
    },
  };
}
