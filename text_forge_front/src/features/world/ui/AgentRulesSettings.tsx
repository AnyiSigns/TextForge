// src/features/world/ui/AgentRulesSettings.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';
import type { AgentRuleSet } from '@/types/world';

interface AgentRulesSettingsProps {
  bookId: number;
  rules?: AgentRuleSet;
  onSave?: (rules: Partial<AgentRuleSet>) => void;
}

const PLAN_STYLES = [
  { value: 'structured', label: '结构化' },
  { value: 'flexible', label: '灵活' },
  { value: 'minimal', label: '极简' },
];

const POV_OPTIONS = [
  { value: 'first', label: '第一人称' },
  { value: 'second', label: '第二人称' },
  { value: 'third', label: '第三人称' },
];

const TENSE_OPTIONS = [
  { value: 'past', label: '过去时' },
  { value: 'present', label: '现在时' },
  { value: 'future', label: '将来时' },
];

const PACE_OPTIONS = [
  { value: 'slow', label: '缓慢' },
  { value: 'moderate', label: '适中' },
  { value: 'fast', label: '快速' },
];

const SENTENCE_OPTIONS = [
  { value: 'short', label: '短句' },
  { value: 'medium', label: '中等' },
  { value: 'long', label: '长句' },
  { value: 'mixed', label: '混合' },
];

const DIALOGUE_OPTIONS = [
  { value: 'low', label: '低' },
  { value: 'balanced', label: '均衡' },
  { value: 'high', label: '高' },
];

const PERSONA_OPTIONS = [
  { value: 'balanced', label: '均衡' },
  { value: 'analytical', label: '分析型' },
  { value: 'creative', label: '创意型' },
  { value: 'strict', label: '严格型' },
];

export function AgentRulesSettings({ bookId, rules, onSave }: AgentRulesSettingsProps) {
  const [form, setForm] = useState<Partial<AgentRuleSet>>(
    rules ?? {
      planStyle: 'structured',
      maxSteps: 5,
      autoStartChecklist: true,
      defaultPOV: 'third',
      defaultTense: 'past',
      defaultPace: 'moderate',
      sentencePreference: 'mixed',
      dialogueRatio: 'balanced',
      agentPersona: 'balanced',
      maxGenerationLength: 5000,
      autoCompressLongText: true,
      pauseBetweenSteps: true,
      checklistConsistencyTimeline: true,
      checklistConsistencyCharacters: true,
      checklistConsistencyForeshadowing: true,
      checklistPace: true,
      checklistWordCount: true,
      autoFixIssues: false,
    }
  );

  const handleSave = () => {
    onSave?.(form);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent 规则配置</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-4">
          <h3 className="text-sm font-semibold">计划规则</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>计划风格</Label>
              <Select
                value={form.planStyle}
                onValueChange={(v) => setForm((prev) => ({ ...prev, planStyle: v as AgentRuleSet['planStyle'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_STYLES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>最大步骤数</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={form.maxSteps ?? 5}
                onChange={(e) => setForm((prev) => ({ ...prev, maxSteps: parseInt(e.target.value) || 5 }))}
              />
            </div>
            <div className="flex items-center space-x-2 pt-6">
              <Checkbox
                id="autoStartChecklist"
                checked={form.autoStartChecklist}
                onCheckedChange={(v) => setForm((prev) => ({ ...prev, autoStartChecklist: !!v }))}
              />
              <Label htmlFor="autoStartChecklist">自动启动检查清单</Label>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold">风格规则</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>默认视角</Label>
              <Select
                value={form.defaultPOV}
                onValueChange={(v) => setForm((prev) => ({ ...prev, defaultPOV: v as AgentRuleSet['defaultPOV'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POV_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>默认时态</Label>
              <Select
                value={form.defaultTense}
                onValueChange={(v) => setForm((prev) => ({ ...prev, defaultTense: v as AgentRuleSet['defaultTense'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TENSE_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>默认节奏</Label>
              <Select
                value={form.defaultPace}
                onValueChange={(v) => setForm((prev) => ({ ...prev, defaultPace: v as AgentRuleSet['defaultPace'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PACE_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>句式偏好</Label>
              <Select
                value={form.sentencePreference}
                onValueChange={(v) => setForm((prev) => ({ ...prev, sentencePreference: v as AgentRuleSet['sentencePreference'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SENTENCE_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>对话占比</Label>
              <Select
                value={form.dialogueRatio}
                onValueChange={(v) => setForm((prev) => ({ ...prev, dialogueRatio: v as AgentRuleSet['dialogueRatio'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIALOGUE_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Agent 人设</Label>
              <Select
                value={form.agentPersona}
                onValueChange={(v) => setForm((prev) => ({ ...prev, agentPersona: v as AgentRuleSet['agentPersona'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERSONA_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold">生成规则</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>单次生成长度上限</Label>
              <Input
                type="number"
                min={500}
                max={10000}
                step={500}
                value={form.maxGenerationLength ?? 5000}
                onChange={(e) => setForm((prev) => ({ ...prev, maxGenerationLength: parseInt(e.target.value) || 5000 }))}
              />
            </div>
            <div className="flex items-center space-x-2 pt-6">
              <Checkbox
                id="autoCompressLongText"
                checked={form.autoCompressLongText}
                onCheckedChange={(v) => setForm((prev) => ({ ...prev, autoCompressLongText: !!v }))}
              />
              <Label htmlFor="autoCompressLongText">超长自动压缩</Label>
            </div>
            <div className="flex items-center space-x-2 pt-6">
              <Checkbox
                id="pauseBetweenSteps"
                checked={form.pauseBetweenSteps}
                onCheckedChange={(v) => setForm((prev) => ({ ...prev, pauseBetweenSteps: !!v }))}
              />
              <Label htmlFor="pauseBetweenSteps">每步之间暂停确认</Label>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold">质检规则</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="checkTimeline"
                checked={form.checklistConsistencyTimeline}
                onCheckedChange={(v) => setForm((prev) => ({ ...prev, checklistConsistencyTimeline: !!v }))}
              />
              <Label htmlFor="checkTimeline">检查时间线一致性</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="checkCharacters"
                checked={form.checklistConsistencyCharacters}
                onCheckedChange={(v) => setForm((prev) => ({ ...prev, checklistConsistencyCharacters: !!v }))}
              />
              <Label htmlFor="checkCharacters">检查角色一致性</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="checkForeshadowing"
                checked={form.checklistConsistencyForeshadowing}
                onCheckedChange={(v) => setForm((prev) => ({ ...prev, checklistConsistencyForeshadowing: !!v }))}
              />
              <Label htmlFor="checkForeshadowing">检查伏笔一致性</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="checkPace"
                checked={form.checklistPace}
                onCheckedChange={(v) => setForm((prev) => ({ ...prev, checklistPace: !!v }))}
              />
              <Label htmlFor="checkPace">检查节奏</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="checkWordCount"
                checked={form.checklistWordCount}
                onCheckedChange={(v) => setForm((prev) => ({ ...prev, checklistWordCount: !!v }))}
              />
              <Label htmlFor="checkWordCount">检查字数</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="autoFixIssues"
                checked={form.autoFixIssues}
                onCheckedChange={(v) => setForm((prev) => ({ ...prev, autoFixIssues: !!v }))}
              />
              <Label htmlFor="autoFixIssues">发现问题自动修正</Label>
            </div>
          </div>
        </section>

        <Button onClick={handleSave}>
          <Save className="h-4 w-4 mr-2" />
          保存规则
        </Button>
      </CardContent>
    </Card>
  );
}