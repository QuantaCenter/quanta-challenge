import { Hono } from 'hono';
import { createNodeWebSocket } from '@hono/node-ws';
import { EventEmitterService } from '../services/event-emitter.js';
import { EventType, type IEventMessage } from '../events/index.js';

const app = new Hono();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.get(
   '/link',
   upgradeWebSocket((c) => {
      return {
         onMessage({ data }, ws) {
            if (data === 'ping') {
               return;
            }
            EventEmitterService.instance.emit<[IEventMessage['MESSAGE']]>(
               EventType.MESSAGE,
               { data, ws }
            );
         },
         onClose(evt, ws) {
            EventEmitterService.instance.emit<[IEventMessage['CLOSE']]>(
               EventType.CLOSE,
               { data: evt, ws }
            );
         },
         onError(evt, ws) {
            EventEmitterService.instance.emit<[IEventMessage['ERROR']]>(
               EventType.ERROR,
               { event: evt, ws }
            );
         },
         onOpen(evt, ws) {
            EventEmitterService.instance.emit<[IEventMessage['OPEN']]>(
               EventType.OPEN,
               {
                  event: evt,
                  data: { url: c.req.url },
                  ws,
               }
            );
         },
      };
   })
);

export { app, injectWebSocket };
