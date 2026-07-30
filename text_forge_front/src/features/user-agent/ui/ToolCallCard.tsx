// src/features/user-agent/ui/ToolCallCard.tsx
// Agent 工具调用卡片：显示单次工具调用的参数、结果和错误

'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Terminal,
} from 'lucide-react';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ToolCallLog } from '@/features/user-agent/types/agent';

interface ToolCallCardProps {
  toolCall: ToolCallLog;
  isExpanded: boolean;
  onToggle: () => void;
}

export function ToolCallCard({
  toolCall,
  isExpanded,
  onToggle,
}: ToolCallCardProps) {
  const getStatusIcon = () => {
    if (toolCall.error) return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    if (toolCall.result) return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />;
  };

  return (
    <Card className="border-l-2 border-l-blue-500/50">
      <CardContent className="p-2">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-blue-500" />
          <span className="font-medium text-sm">{toolCall.toolName}</span>
          <span className="text-[10px] text-muted-foreground">
            {new Date(toolCall.startedAt).toLocaleTimeString()}
          </span>
          <span className="flex-1" />
          {getStatusIcon()}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={onToggle}
            aria-label={isExpanded ? '收起' : '展开'}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </Button>
        </div>

        {isExpanded && (
          <div className="mt-2 space-y-2 ml-6 border-l border-muted-foreground/20 pl-3">
            {toolCall.parameters && Object.keys(toolCall.parameters).length > 0 && (
              <details className="group">
                <summary className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                  <span>参数</span>
                  <span className="text-[10px]">
                    ({Object.keys(toolCall.parameters).length} 项)
                  </span>
                </summary>
                <pre className="mt-1 p-2 bg-background/50 rounded text-[10px] overflow-x-auto max-h-32">
                  {JSON.stringify(toolCall.parameters, null, 2)}
                </pre>
              </details>
            )}

            {(toolCall.result || toolCall.error) && (
              <details className="group">
                <summary className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                  <span>{toolCall.error ? '错误' : '结果'}</span>
                </summary>
                <pre
                  className={cn(
                    'mt-1 p-2 bg-background/50 rounded text-[10px] overflow-x-auto max-h-32',
                    toolCall.error && 'text-red-500'
                  )}
                >
                  {toolCall.error || toolCall.result}
                </pre>
              </details>
            )}

            {toolCall.endedAt && (
              <div className="text-[10px] text-muted-foreground">
                耗时:{' '}
                {new Date(toolCall.endedAt).getTime() -
                  new Date(toolCall.startedAt).getTime()}
                ms
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}