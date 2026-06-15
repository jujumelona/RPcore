// src/store/globalLoadingStore.ts
import { create } from 'zustand';

interface GlobalLoadingStore {
  count: number;
  push: () => void;
  pop:  () => void;
  set:  (loading: boolean) => void;
}

export const useGlobalLoadingStore = create<GlobalLoadingStore>((set, get) => ({
  count: 0,
  push: () => set(s => ({ count: s.count + 1 })),
  pop:  () => set(s => ({ count: Math.max(0, s.count - 1) })),
  set:  (loading: boolean) => {
    if (loading) get().push();
    else get().pop();
  } }));
