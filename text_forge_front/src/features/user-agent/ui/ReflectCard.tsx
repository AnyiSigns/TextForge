// src/features/user-agent/ui/ReflectCard.tsx
// Agent 反思结果卡片 + 实体提取 proposals

'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertCircle, Plus } from 'lucide-react';
import { useState } from 'react';
import type { EntityProposal } from '@/features/user-agent/types/agent';

interface ReflectCardProps {
  summary: string;
  entityProposals?: EntityProposal[];
  onEntityConfirm?: (entityIds: string[]) => void;
  onEntityDismiss?: () => void;
}

export function ReflectCard({
  summary,
  entityProposals = [],
  onEntityConfirm,
  onEntityDismiss,
}: ReflectCardProps) {
  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(new Set());

  const toggleEntity = (id: string) => {
    const next = new Set(selectedEntities);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedEntities(next);
  };

  const handleConfirm = () => {
    if (onEntityConfirm) {
      onEntityConfirm(Array.from(selectedEntities));
    }
  };

  return (
    <Card className="border-purple-500/30 bg-purple-500/5 dark:border-purple-900/30 dark:bg-purple-900/10">
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-purple-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-purple-700 dark:text-purple-300">
              {summary}
            </p>

            {entityProposals.length > 0 && (
              <div className="mt-2 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  发现新实体，请确认：
                </p>
                {entityProposals.map((proposal) => (
                  <div
                    key={proposal.id}
                    className="flex items-center gap-2 p-1.5 rounded border border-muted/50"
                  >
                    <button
                      type="button"
                      className={`w-4 h-4 rounded border flex items-center justify-center ${
                        selectedEntities.has(proposal.id)
                          ? 'bg-primary border-primary'
                          : 'border-muted-foreground/30'
                      }`}
                      onClick={() => toggleEntity(proposal.id)}
                    >
                      {selectedEntities.has(proposal.id) && (
                        <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                      )}
                    </button>
                    <Badge variant="outline" className="text-[10px]">
                      {proposal.type}
                    </Badge>
                    <span className="text-xs">{proposal.name}</span>
                    <span className="text-[10px] text-muted-foreground flex-1">
                      {proposal.reason}
                    </span>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  {onEntityConfirm && (
                    <Button
                      variant="default"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleConfirm}
                      disabled={selectedEntities.size === 0}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      确认录入 ({selectedEntities.size})
                    </Button>
                  )}
                  {onEntityDismiss && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={onEntityDismiss}
                    >
                      忽略
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}