import type { IStore } from '../utils/i-store';

const store = new LocalStore();

export const useStore = (): IStore => {
   return store;
};
