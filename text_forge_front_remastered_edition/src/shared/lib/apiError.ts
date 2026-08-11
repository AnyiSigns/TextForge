import type { AxiosError } from 'axios';
import { toast } from 'sonner';

/**
 * 统一解析后端错误，向前端展示「友好且具体」的提示。
 *
 * 原则：
 * - 用户可自助解决的错误（密码错误、API Key 无效、额度/网络/超时、文件过大等）
 *   后端已返回具体文案，这里原样展示并附可操作建议（hint）。
 * - 内部错误（数据库、未捕获异常）后端只返回通用文案，这里不臆造细节、
 *   也不把任何技术信息暴露给用户。
 */

export interface ApiErrorInfo {
  /** 给用户的友好主信息 */
  message: string;
  /** 后端返回的错误码（用于匹配可操作建议） */
  errorCode?: string;
  /** HTTP 状态码 */
  status?: number;
}

/** 错误码 → 可操作建议 */
const HINTS: Record<string, string> = {
  INVALID_API_KEY: '请到「设置 → 模型」检查并重新填写 API Key。',
  QUOTA_OR_RATE: '请检查模型服务商的账户余额或调用额度，稍后重试。',
  MODEL_TIMEOUT: '可稍后重试，或调大「设置 → 模型」中的请求超时时间。',
  MODEL_NETWORK: '请确认 base_url 正确，且服务器能访问该地址（必要时配置代理）。',
  MODEL_CONTEXT: '请精简输入，或开启上下文压缩 / 新建会话后再试。',
  MODEL_NOT_FOUND: '请检查「设置 → 模型」中的模型名称（model_id）是否填写正确。',
  MODEL_REJECTED: '请检查输入内容是否合规，或修改模型参数后重试。',
  MODEL_SERVER_ERROR: '模型服务端暂时不可用，请稍后重试。',
  MODEL_UNKNOWN: '请检查模型配置（base_url / model_id / API Key）后重试。',
  DB_CONFLICT: '数据冲突，请刷新页面后重试。',
  FILE_EMPTY: '请上传非空的有效文件。',
  FILE_TOO_LARGE: '文件体积过大，请压缩或拆分为更小的文件后重试。',
  FILE_TYPE: '仅支持 TXT / Markdown / JSON / CSV 文档，或 JPG / PNG / WebP / GIF 图片。',
  FILE_ENCODING: '暂不支持该文件编码，请使用 UTF-8 编码后重试。',
  VALIDATION_ERROR: '请检查表单填写是否完整、格式是否正确。',
};

function _extractDetail(data: unknown): { message?: string; errorCode?: string } {
  if (!data || typeof data !== 'object') return {};
  const d = data as Record<string, unknown>;
  if (typeof d.detail === 'string') return { message: d.detail };
  if (Array.isArray(d.detail)) {
    const parts = d.detail
      .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
      .map((it) => {
        const loc = Array.isArray(it.loc) ? (it.loc as unknown[]).join('.') : '';
        const msg = typeof it.msg === 'string' ? it.msg : '';
        return loc ? `${loc}: ${msg}` : msg;
      })
      .filter(Boolean);
    if (parts.length > 0) return { message: parts.join('；') };
  }
  if (d.detail && typeof d.detail === 'object') {
    const inner = d.detail as Record<string, unknown>;
    const msg = typeof inner.message === 'string' ? inner.message : undefined;
    return { message: msg, errorCode: typeof d.error_code === 'string' ? d.error_code : undefined };
  }
  if (typeof d.message === 'string') return { message: d.message };
  return {};
}

export function parseApiError(err: unknown): ApiErrorInfo {
  const axiosErr = err as AxiosError<unknown>;
  const data = axiosErr?.response?.data;
  const status = axiosErr?.response?.status;

  const fromData = _extractDetail(data);
  if (fromData.message) {
    return { message: fromData.message, errorCode: fromData.errorCode, status };
  }

  // fetch 风格：auth.ts 等直接 throw new Error(data.detail)
  if (err instanceof Error && err.message) {
    return { message: err.message, status };
  }

  // 网络 / 超时（无响应体）
  if (!axiosErr?.response) {
    if (axiosErr?.code === 'ECONNABORTED' || axiosErr?.code === 'ETIMEDOUT') {
      return { message: '请求超时，请稍后重试。', status };
    }
    return { message: '网络连接失败，请检查网络或代理设置。', status };
  }

  return { message: '请求失败，请稍后重试。', status };
}

/** 返回给用户的友好主信息（拿不到时用 fallback）。 */
export function getApiErrorMessage(err: unknown, fallback = '操作失败'): string {
  const { message } = parseApiError(err);
  return message || fallback;
}

/** 根据错误码 / 文案匹配可操作建议（hint），匹配不到返回 undefined。 */
export function getApiErrorHint(err: unknown): string | undefined {
  const { errorCode, message } = parseApiError(err);
  if (errorCode && HINTS[errorCode]) return HINTS[errorCode];
  if (/api key|密钥|authentication|401|权限不足/i.test(message)) return HINTS.INVALID_API_KEY;
  if (/quota|额度|余额|rate|频率|429/i.test(message)) return HINTS.QUOTA_OR_RATE;
  if (/timeout|超时/i.test(message)) return HINTS.MODEL_TIMEOUT;
  if (/connect|网络|代理|resolve|refused|base_url/i.test(message)) return HINTS.MODEL_NETWORK;
  if (/context length|上下文|token/i.test(message)) return HINTS.MODEL_CONTEXT;
  if (/文件内容为空/i.test(message)) return HINTS.FILE_EMPTY;
  if (/文件体积过大|过大/i.test(message)) return HINTS.FILE_TOO_LARGE;
  if (/文件类型|格式不支持|仅支持/i.test(message)) return HINTS.FILE_TYPE;
  if (/编码/i.test(message)) return HINTS.FILE_ENCODING;
  if (/数据冲突/i.test(message)) return HINTS.DB_CONFLICT;
  return undefined;
}

/**
 * 统一的「错误 toast」：主信息展示具体原因，副信息（description）展示可操作建议。
 * 用法：.catch((e) => showApiError(e, '保存失败'))
 */
export function showApiError(err: unknown, fallback = '操作失败'): void {
  const message = getApiErrorMessage(err, fallback);
  const hint = getApiErrorHint(err);
  toast.error(message, hint ? { description: hint } : undefined);
}
