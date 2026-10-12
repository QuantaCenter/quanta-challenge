export class Singleton {
   private static instances = new Map<Function, Singleton>();

   constructor() {}

   protected static getInstance<T extends Singleton>(): T {
      if (!Singleton.instances.has(this)) {
         Singleton.instances.set(this, new (this as any)());
      }
      return Singleton.instances.get(this) as T;
   }
}
