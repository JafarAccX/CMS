import { create } from "zustand";

interface Batch {
  id: string;
  name: string;
  description?: string;
  type: string;
  is_paid: boolean;
  hasAccess: boolean;
  userMembership: { user_id: string; role_in_batch: string } | null;
  batch_settings: { allow_guests: boolean; max_members: number | null; is_archived: boolean } | null;
  _count: { messages: number; memberships: number };
}

interface BatchState {
  batches: Batch[];
  activeBatchId: string | null;
  setBatches: (batches: Batch[]) => void;
  setActive: (id: string | null) => void;
  getActiveBatch: () => Batch | undefined;
}

export const useBatchStore = create<BatchState>()((set, get) => ({
  batches: [],
  activeBatchId: null,

  setBatches: (batches) => set({ batches }),
  setActive: (id) => set({ activeBatchId: id }),
  getActiveBatch: () => get().batches.find((b) => b.id === get().activeBatchId),
}));
