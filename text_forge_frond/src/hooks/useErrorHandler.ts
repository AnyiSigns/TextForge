// src/hooks/useErrorHandler.ts
'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

export function useErrorHandler() {
  return useCallback((error: unknown, title = '操作失败') => {
    if (error instanceof Error) {
      logger.error(`${title}: ${error.message}`, { stack: error.stack });
      toast.error(title, { description: error.message });
    } else {
      logger.error(title, { error });
      toast.error(title, { description: String(error) });
    }
  }, []);
}