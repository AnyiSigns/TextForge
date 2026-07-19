// src/lib/utils/network.ts
import { toast } from 'sonner';

let hasShownOfflineToast = false;

export function setupNetworkListener() {
  const handleOnline = () => {
    hasShownOfflineToast = false;
    toast.success('网络已恢复', { duration: 2000 });
  };

  const handleOffline = () => {
    if (!hasShownOfflineToast) {
      hasShownOfflineToast = true;
      toast.warning('网络已断开', { duration: 5000 });
    }
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}