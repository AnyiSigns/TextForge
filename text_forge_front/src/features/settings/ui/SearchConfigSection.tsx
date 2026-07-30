'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface SearchConfigSectionProps {
  searchConfig: { api_key: string; provider: string } | null;
  onChange: (apiKey: string) => void;
}

export function SearchConfigSection({ searchConfig, onChange }: SearchConfigSectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Web 搜索配置（博查）</p>
      </div>
      <div className="rounded-xl border border-border/40 bg-background/40 p-3 space-y-2">
        <p className="text-xs text-muted-foreground">博查 Search API 用于 Agent 联网搜索工具（web_search）。</p>
        <div className="space-y-1.5">
          <Label htmlFor="search-api-key" className="text-xs">博查 API Key</Label>
          <Input
            id="search-api-key"
            type="password"
            value={searchConfig?.api_key ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="sk-xxx"
            className="h-8 text-xs"
          />
        </div>
        {searchConfig?.api_key && (
          <p className="text-[10px] text-muted-foreground">Provider: bocha</p>
        )}
      </div>
    </div>
  );
}