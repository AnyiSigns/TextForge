import { fetchModelConfig } from './models';
import { apiClient } from './client';

export interface CardField {
  key: string;
  value: string | string[];
}

export interface Card {
  title: string;
  fields: CardField[];
  card_type?: string;
}

export interface WizardCard {
  title: string;
  fields: Array<{ key: string; value: string }>;
}

export interface WizardGenerateResponse {
  step: number;
  cards: WizardCard[];
}

async function getModelConfigData() {
  try {
    const cfg = await fetchModelConfig();
    const main = cfg.textRoleModels?.main;
    if (!main) return null;
    return {
      main_config: {
        adapter: main.adapter,
        base_url: main.base_url,
        api_key: main.api_key,
        model_id: main.model_id,
      },
    };
  } catch {
    return null;
  }
}

/**
 * 调用后端 AI 为初始化向导生成候选卡片。
 * Step 0: 返回表单填充数据（前端取第一项填入表单）。
 * Step 1-6: 返回候选卡片列表。
 */
export async function generateWizardCards(
  bookId: number,
  step: number,
  previousCards?: Array<{ step: number; title: string; fields: Array<{ key: string; value: string }> }>,
  excludeTitles?: string[],
): Promise<WizardCard[]> {
  const modelConfigData = await getModelConfigData();
  const { data } = await apiClient.post<WizardGenerateResponse>('/wizard/generate', {
    book_id: bookId,
    step,
    previous_cards: previousCards || [],
    exclude_titles: excludeTitles || [],
    model_config_data: modelConfigData,
  });
  return data.cards ?? [];
}
