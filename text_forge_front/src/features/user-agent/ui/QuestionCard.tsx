// src/features/user-agent/ui/QuestionCard.tsx
// Agent 提问卡片：think 阶段发现上下文缺失时展示

'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface QuestionCardProps {
  question: string;
  context?: string;
  onAnswer?: (answer: string) => void;
  onDismiss?: () => void;
}

export function QuestionCard({
  question,
  context,
  onAnswer,
  onDismiss,
}: QuestionCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border-amber-500/30 bg-amber-500/5 dark:border-amber-900/30 dark:bg-amber-900/10">
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
              {question}
            </p>
            {context && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground mt-1"
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? (
                    <>
                      <ChevronUp className="h-3 w-3 mr-1" />
                      收起上下文
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3 mr-1" />
                      查看上下文
                    </>
                  )}
                </Button>
                {expanded && (
                  <pre className="mt-1 p-2 bg-background/50 rounded text-xs overflow-x-auto max-h-32 text-muted-foreground">
                    {context}
                  </pre>
                )}
              </>
            )}
            <div className="flex items-center gap-2 mt-2">
              {onAnswer && (
                <Button
                  variant="default"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onAnswer('')}
                >
                  回答
                </Button>
              )}
              {onDismiss && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={onDismiss}
                >
                  忽略
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}