import type { WSContext, WSMessageReceive } from 'hono/ws';

export enum EventType {
   MESSAGE = 'message',
   CLOSE = 'close',
   ERROR = 'error',
   OPEN = 'open',
}

export interface IEventMessage {
   MESSAGE: {
      data: WSMessageReceive;
      ws: WSContext<WebSocket>;
   };
   CLOSE: {
      data: CloseEvent;
      ws: WSContext<WebSocket>;
   };
   ERROR: {
      event: Event;
      ws: WSContext<WebSocket>;
   };
   OPEN: {
      event: Event;
      data: { url: string };
      ws: WSContext<WebSocket>;
   };
}
