declare module 'condenser:api' {
  export function useSend(
    pluginId: string,
  ): (action: string, data?: unknown) => Promise<any>;
}
