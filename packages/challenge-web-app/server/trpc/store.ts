import type { IStore } from '../utils/i-store';
import { LocalStore } from '../utils/local-store';

const store = new LocalStore();

export const useStore = (): IStore => {
   return store;
};
