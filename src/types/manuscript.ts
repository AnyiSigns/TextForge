// src/types/manuscript.ts
// 作家手稿章节类型（独立于工作台 AI steps，可双向互导）。

/** 作家手稿章节（独立于工作台 AI steps，可双向互导） */
export interface ManuscriptChapter {
  id: string;
  projectId: string;
  index: number;             // 章节序号，用于排序
  title: string;
  content: string;
  updatedAt: string;
  source?: 'manual' | 'imported' | 'ai' | 'ai_edited';   // 人工撰写 / 从工作台导入 / 纯AI / AI后手工修改
  linkedStepId?: string;     // 若从工作台某 step 导入，记录来源
}
