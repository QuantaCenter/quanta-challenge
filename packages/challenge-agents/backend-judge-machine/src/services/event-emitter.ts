import { Singleton } from '../utils/singleton.js';

export class EventEmitterService extends Singleton {
   static get instance() {
      return this.getInstance<EventEmitterService>();
   }

   private listeners: Map<string, ((...args: any[]) => void)[]> = new Map();

   on<Payload = any>(event: string, listener: (payload: Payload) => void) {
      if (!this.listeners.has(event)) {
         this.listeners.set(event, []);
      }
      this.listeners.get(event)?.push(listener);
   }

   off<Payload = any>(event: string, listener: (payload: Payload) => void) {
      const listeners = this.listeners.get(event);
      if (listeners) {
         this.listeners.set(
            event,
            listeners.filter((l) => l !== listener)
         );
      }
   }

   emit<Payload extends any[]>(event: string, ...args: Payload) {
      const listeners = this.listeners.get(event);
      if (listeners) {
         listeners.forEach((listener) => listener(...args));
      }
   }

   cleanup() {
      this.listeners.clear();
   }
}
