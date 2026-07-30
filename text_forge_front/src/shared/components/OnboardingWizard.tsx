'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useBookStore } from '@/features/projects';
import { useCharacterStore } from '@/features/characters';
import { useCreativeSettingStore } from '@/features/projects';
import { useOnboardingStore } from '@/lib/stores/onboardingStore';
import type { OnboardingStep } from '@/lib/stores/onboardingStore';
import { BookOpen, Users, PenLine, CheckCircle2, Sparkles, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

const TEMPLATES = [
  { key: 'generic', label: '通用', desc: '适合大多数小说类型', genre: 'general' },
  { key: 'sci-fi', label: '科幻', desc: '硬科幻 / 赛博朋克 / 太空歌剧', genre: 'science-fiction' },
  { key: 'fantasy', label: '奇幻', desc: '西方奇幻 / 东方玄幻 / 蒸汽朋克', genre: 'fantasy' },
];

const STEPS = [
  { key: 'welcome', label: '欢迎', icon: Sparkles },
  { key: 'book', label: '创建书籍', icon: BookOpen },
  { key: 'setting', label: '创作设定', icon: PenLine },
  { key: 'character', label: '创建角色', icon: Users },
  { key: 'outline', label: '创建大纲', icon: CheckCircle2 },
];

export function OnboardingWizard() {
  const router = useRouter();
  const { currentStep, setStep, completeStep, currentBookId, setCurrentBookId } = useOnboardingStore();
  const { addBook } = useBookStore();
  const { addCharacter } = useCharacterStore();
  const { upsertSetting } = useCreativeSettingStore();

  const [bookTitle, setBookTitle] = useState('');
  const [bookTemplate, setBookTemplate] = useState('generic');
  const [worldview, setWorldview] = useState('');
  const [tone, setTone] = useState('');
  const [taboos, setTaboos] = useState('');
  const [charName, setCharName] = useState('');
  const [charDesc, setCharDesc] = useState('');
  const [outlineTitle, setOutlineTitle] = useState('');

  const stepIndex = STEPS.findIndex((s) => s.key === currentStep);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  const handleNext = async () => {
    switch (currentStep) {
      case 'welcome':
        completeStep('welcome');
        setStep('book');
        break;
      case 'book':
        if (!bookTitle.trim()) { toast.error('请输入书名'); return; }
        try {
          const template = TEMPLATES.find((t) => t.key === bookTemplate);
          const book = await addBook({
            title: bookTitle.trim(),
            description: template?.desc ?? '',
            genre: template?.genre ?? 'general',
          });
          setCurrentBookId(book.id);
          completeStep('book');
          setStep('setting');
          toast.success(`已创建书籍《${bookTitle.trim()}》`);
        } catch {
          toast.error('创建书籍失败');
        }
        break;
      case 'setting':
        try {
          if (currentBookId) {
            await upsertSetting({
              bookId: currentBookId,
              worldview: worldview || '',
              tone: tone || '',
              writingTaboos: taboos || '',
            });
          }
          completeStep('setting');
          setStep('character');
          toast.success('创作设定已保存');
        } catch {
          toast.error('保存设定失败');
        }
        break;
      case 'character':
        if (!charName.trim()) { toast.error('请输入角色名'); return; }
        try {
          await addCharacter({
            name: charName.trim(),
            description: charDesc.trim() || '暂无描述',
            bookId: currentBookId ?? null,
          });
          completeStep('character');
          setStep('outline');
          toast.success(`已创建角色「${charName.trim()}」`);
        } catch {
          toast.error('创建角色失败');
        }
        break;
      case 'outline':
        if (!outlineTitle.trim()) { toast.error('请输入大纲标题'); return; }
        completeStep('outline');
        setStep('done');
        toast.success('引导完成！开始你的创作吧');
        break;
      case 'done':
        router.push('/projects');
        break;
    }
  };

  const handleSkip = () => {
    router.push('/projects');
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">首次使用引导</h2>
        <Button variant="ghost" size="sm" onClick={handleSkip}>跳过</Button>
      </div>

      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex gap-2">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex-1 flex items-center gap-1.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium ${i <= stepIndex ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              {i < stepIndex ? <CheckCircle2 className="w-3 h-3" /> : i + 1}
            </div>
            <span className={`text-[10px] ${i <= stepIndex ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</span>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border/60 bg-background/60 p-6">
        {currentStep === 'welcome' && (
          <div className="space-y-4 text-center">
            <Sparkles className="w-12 h-12 text-primary mx-auto" />
            <h3 className="text-xl font-semibold">欢迎来到 TextForge</h3>
            <p className="text-sm text-muted-foreground">这是一个 AI 辅助创作平台。跟着引导几步，即可开始你的第一部作品。</p>
          </div>
        )}

        {currentStep === 'book' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">创建你的第一本书</h3>
            <Input value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} placeholder="书名，如《星海之旅》" />
            <div className="grid grid-cols-3 gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setBookTemplate(t.key)}
                  className={`rounded-xl border p-3 text-left transition-colors ${bookTemplate === t.key ? 'border-primary bg-primary/[0.06]' : 'border-border/40 hover:bg-accent/30'}`}
                >
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {currentStep === 'setting' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">创作设定</h3>
            <Textarea value={worldview} onChange={(e) => setWorldview(e.target.value)} placeholder="世界观描述（可选）" rows={3} />
            <Input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="文风，如轻松幽默或严肃写实" />
            <Textarea value={taboos} onChange={(e) => setTaboos(e.target.value)} placeholder="写作禁忌（可选）" rows={2} />
          </div>
        )}

        {currentStep === 'character' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">创建第一个角色</h3>
            <Input value={charName} onChange={(e) => setCharName(e.target.value)} placeholder="角色名，如林墨" />
            <Textarea value={charDesc} onChange={(e) => setCharDesc(e.target.value)} placeholder="角色描述（可选）" rows={3} />
          </div>
        )}

        {currentStep === 'outline' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">创建大纲</h3>
            <Input value={outlineTitle} onChange={(e) => setOutlineTitle(e.target.value)} placeholder="大纲标题，如第一卷·星海初现" />
            <p className="text-xs text-muted-foreground">你可以在项目详情页继续完善大纲、添加章节和情节节点。</p>
          </div>
        )}

        {currentStep === 'done' && (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <h3 className="text-xl font-semibold">引导完成！</h3>
            <p className="text-sm text-muted-foreground">你已经完成了基本设置，现在可以开始创作了。</p>
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" size="sm" onClick={() => { if (stepIndex > 0) setStep(STEPS[stepIndex - 1].key as OnboardingStep); }} disabled={stepIndex === 0}>上一步</Button>
        <Button size="sm" onClick={handleNext}>
          {currentStep === 'done' ? '进入项目' : '下一步'}
          <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}