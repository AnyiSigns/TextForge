// src/features/user-agent/ui/SuggestionBubble.tsx
// Agent 主动建议气泡：对话末尾的可点击建议

'use client';

import { Button } from '@/components/ui/button';
import { ArrowRight, Lightbulb } from 'lucide-react';

interface SuggestionBubbleProps {
  suggestions: Array<{
    id: string;
    text: string;
    action: string;
  }>;
  onSuggestionClick?: (suggestion: string) => void;
}

export function SuggestionBubble({
  suggestions,
  onSuggestionClick,
}: SuggestionBubbleProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="mt-3 p-3 bg-muted/30 rounded-lg border border-muted/50">
      <div className="flex items-center gap-2 mb-2">
        <Lightbulb className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          建议操作
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <Button
            key={suggestion.id}
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => onSuggestionClick?.(suggestion.action)}
          >
            {suggestion.text}
            <ArrowRight className="h-3 w-3" />
          </Button>
        ))}
      </div>
    </div>
  );
}