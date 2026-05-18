export enum MessageType {
  CALL  = 'CALL',
  REPLY = 'REPLY',
  EVENT = 'EVENT',
}

export enum Route {
  GET_PLUGINS = 'get-plugins',
}

export enum WsEvent {
  PLUGIN_UPDATED = 'plugin-updated',
}

export const Auth = {
  ENDPOINT:   '/auth/token',
  QUERY_PARAM: 'auth',
  TOKEN_KEY:  'token',
} as const;
