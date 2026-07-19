// src/lib/hooks/useNetworkStatus.ts
import { useEffect } from 'react';
import { setupNetworkListener, isOnline } from '@/lib/utils/network';

export function useNetworkStatus() {
  useEffect(() => {
    const cleanup = setupNetworkListener();
    return cleanup;
  }, []);

  return { isOnline: isOnline() };
}