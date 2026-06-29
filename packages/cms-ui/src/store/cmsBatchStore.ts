import { create } from "zustand";

interface Batch {
  id: string;
  name: string;
  description?: string;
  type: string;
  is_paid: boolean;
  is_pinned?: boolean;
  hasAccess: boolean;
  userMembership: { user_id: string; role_in_batch: string } | null;
  batch_settings: { allow_guests: boolean; max_members: number | null; is_archived: boolean } | null;
  _count: { channels?: number; messages?: number; memberships: number };
}

interface CmsBatchState {
  batches: Batch[];
  activeBatchId: string | null;
  setBatches: (batches: Batch[]) => void;
  setActive: (id: string | null) => void;
  getActiveBatch: () => Batch | undefined;
  reset: () => void;
}

export const useCmsBatchStore = create<CmsBatchState>()((set, get) => ({
  batches: [],
  activeBatchId: null,

  setBatches: (batches) => {
    if (!Array.isArray(batches)) {
      console.error("[cmsBatchStore] Received non-array for batches:", batches);
      set({ batches: [] });
      return;
    }
    set({ batches });
  },
  setActive: (id) => set({ activeBatchId: id }),
  getActiveBatch: () => get().batches.find((b) => b.id === get().activeBatchId),
  reset: () => set({ batches: [], activeBatchId: null }),
}));
