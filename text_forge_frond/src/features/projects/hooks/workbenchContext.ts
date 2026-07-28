// src/lib/hooks/workbenchContext.ts
// 工作台上下文构造与章节级辅助：buildContext（注入生成基座）、summarizePlot（压缩前文）、
// depositCharacterProfiles（复盘沉淀角色状态）。均为接收依赖的纯函数工厂，便于复用与测试。
import type { Character } from '@/types';
import { creativeSettingToContextLine, creativeSettingDimensionsToContext } from '@/features/projects';
import { characterRoleLabel } from '@/shared/lib/agentRoles';
import type { OutlineVolume } from '@/lib/storage/backup';
import type { BookCreativeSetting } from '@/types';

export interface BuildContextDeps {
  bookId: number;
  bookTitle: string | undefined;
  creativeSetting: BookCreativeSetting | undefined;
  projectChars: Character[];
  selectedCharIds: number[];
  outlineVolumes: OutlineVolume[];
  plotSummary: string;
  selectedSectionIds: string[];
  charNameById: (id: number) => string;
}

export function makeBuildContext(deps: BuildContextDeps) {
  const { bookId, bookTitle, creativeSetting, projectChars, selectedCharIds, outlineVolumes, plotSummary, selectedSectionIds, charNameById } = deps;
  return () => {
    const briefLine = creativeSettingToContextLine(creativeSetting);

    const contextChars = projectChars
      .filter((c) => selectedCharIds.includes(c.id))
      .map((c) => ({
        name: c.name,
        role: c.roleType && c.roleType !== 'custom' ? characterRoleLabel(c.roleType) : c.roleType === 'custom' ? undefined : undefined,
        description: c.description,
        status: c.status ?? '存活',
        relationships: c.relationshipChain?.length
          ? c.relationshipChain
              .filter((r) => r.target && r.relation.trim())
              .map((r) => ({ target: charNameById(r.target) || r.target, relation: r.relation.trim() }))
          : undefined,
      }));

    const outlineText = outlineVolumes.length
      ? outlineVolumes
          .map((vol) =>
            vol.chapters
              .map((ch) =>
                ch.nodes
                  .map((n) => `· ${vol.title}/${ch.title}：${n.title}${n.content ? `（${n.content}）` : ''}`)
                  .join('\n'),
              )
              .join('\n'),
          )
          .join('\n')
      : undefined;
    const outlineTree = outlineVolumes.length ? outlineVolumes : undefined;

    const sectionLine = creativeSettingDimensionsToContext(creativeSetting?.customDimensions, selectedSectionIds);
    const sections = sectionLine
      ? sectionLine.split('；').map((s) => {
          const idx = s.indexOf('：');
          return idx > -1 ? { title: s.slice(0, idx), content: s.slice(idx + 1) } : { title: '', content: s };
        })
      : undefined;

    return {
      book_id: bookId,
      book_title: bookTitle,
      brief: briefLine,
      plot_summary: plotSummary || undefined,
      outline: outlineText,
      outlineTree,
      characters: contextChars.length ? contextChars : undefined,
      sections,
    };
  };
}

export function makeSummarizePlot(_bookId: number) {
  return async (text: string): Promise<string> => {
    if (!text.trim()) return '';
    const paras = text.split(/\n{2,}|\n/).map((s) => s.trim()).filter(Boolean);
    if (paras.length <= 6) return text.slice(0, 2000);
    const head = paras.slice(0, 3).join('\n');
    const tail = paras.slice(-3).join('\n');
    return `（前文要点）${head}\n…\n（最新进展）${tail}`.slice(0, 2000);
  };
}

export function makeDepositCharacterProfiles(projectChars: Character[]) {
  return async (text: string): Promise<void> => {
    if (!projectChars.length) return;
    const updateCharacter = (await import('@/features/characters')).useCharacterStore.getState().updateCharacter;
    for (const c of projectChars) {
      const name = c.name?.trim();
      if (!name) continue;
      const mention = text.includes(name);
      if (!mention) continue;
      const died = /死亡|陨落|牺牲|毙命|咽气/.test(text);
      if (died && c.status !== '死亡') {
        const note = `于剧情中死亡（由生成结果自动沉淀）`;
        try {
          await updateCharacter(c.id, { status: '死亡' });
        } catch { /* 忽略 */ }
      } else {
        const note = `本章出场并参与剧情`;
        try {
          await updateCharacter(c.id, { status: '出场' });
        } catch { /* 忽略 */ }
      }
    }
  };
}
