import { useEntityStore } from '@/features/map/stores/entityStore';

export function seedMockData() {
  useEntityStore.getState().seed();
}

export function resetMockData() {
  useEntityStore.getState().reset();
}
