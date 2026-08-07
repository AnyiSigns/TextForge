import { getItem, setItem } from './indexedDB';

const BG_IMAGE_KEY = 'themeBgImage';
const BG_OPACITY_KEY = 'themeBgOpacity';
const BG_BLUR_KEY = 'themeBgBlur';
const GLASS_ENABLED_KEY = 'themeGlassEnabled';
const GLASS_OPACITY_KEY = 'themeGlassOpacity';
const GLASS_BLUR_KEY = 'themeGlassBlur';

/** 背景变更广播事件名：ThemeBgInit 监听并同步渲染背景图 */
export const THEME_BG_EVENT = 'theme-bg:update';

export interface ThemeBgSettings {
  bgImage: string | null;
  bgOpacity: number;
  bgBlur: number;
  glassEnabled: boolean;
  glassOpacity: number;
  glassBlur: number;
}

const DEFAULTS: ThemeBgSettings = {
  bgImage: null,
  bgOpacity: 0.3,
  bgBlur: 0,
  glassEnabled: false,
  glassOpacity: 0.7,
  glassBlur: 12,
};

function broadcast(settings: ThemeBgSettings) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ThemeBgSettings>(THEME_BG_EVENT, { detail: settings }),
  );
}

/**
 * 仅应用不涉及背景图的 CSS 变量（透明度/模糊/玻璃）与 class。
 * 背景图本身由 ThemeBgInit 通过 inline style 渲染，避免大 base64
 * 塞入 CSS 变量导致 url() 解析失败。
 */
function applyCSS(settings: ThemeBgSettings) {
  const root = document.documentElement;
  const style = root.style;

  style.setProperty('--bg-image-opacity', String(settings.bgOpacity));
  style.setProperty('--bg-image-blur', `${settings.bgBlur}px`);
  style.setProperty('--glass-opacity', String(settings.glassOpacity));
  style.setProperty('--glass-blur', `${settings.glassBlur}px`);

  if (settings.glassEnabled) {
    root.classList.add('glass');
  } else {
    root.classList.remove('glass');
  }

  document.body.classList.toggle('has-theme-bg', !!settings.bgImage);
}

/** 允许作为背景的栅格图片 MIME（拒绝 SVG 等可携带脚本的类型） */
const SAFE_BG_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * 兼容旧版本存储格式：早期版本剥离了 data: 前缀只存裸 base64，
 * 无法直接作为 CSS url 使用。按 base64 魔数补全 MIME 前缀。
 * 同时校验 data URI 的 MIME 类型，拒绝非栅格图片。
 */
function normalizeBgImage(raw: string | undefined | null): string | null {
  if (!raw) return null;
  if (raw.startsWith('data:')) {
    const m = raw.match(/^data:(image\/[a-z0-9.+-]+)(?:;|,)/);
    if (!m || !SAFE_BG_MIME.has(m[1])) return null;
    return raw;
  }
  let mime: string | null = null;
  if (raw.startsWith('/9j/')) mime = 'image/jpeg';
  else if (raw.startsWith('iVBOR')) mime = 'image/png';
  else if (raw.startsWith('UklGR')) mime = 'image/webp';
  else if (raw.startsWith('R0lGOD')) mime = 'image/gif';
  return mime ? `data:${mime};base64,${raw}` : null;
}

export async function loadThemeBackground(): Promise<ThemeBgSettings> {
  if (typeof window === 'undefined') return { ...DEFAULTS };

  const [bgImage, bgOpacity, bgBlur, glassEnabled, glassOpacity, glassBlur] =
    await Promise.all([
      getItem<string>(BG_IMAGE_KEY),
      getItem<number>(BG_OPACITY_KEY),
      getItem<number>(BG_BLUR_KEY),
      getItem<boolean>(GLASS_ENABLED_KEY),
      getItem<number>(GLASS_OPACITY_KEY),
      getItem<number>(GLASS_BLUR_KEY),
    ]);

  // 迁移旧格式裸 base64 → 完整 data URI 并回写
  const normalized = normalizeBgImage(bgImage);
  if (bgImage && normalized !== bgImage) {
    await setItem(BG_IMAGE_KEY, normalized);
  }

  const settings: ThemeBgSettings = {
    bgImage: normalized,
    bgOpacity: bgOpacity ?? DEFAULTS.bgOpacity,
    bgBlur: bgBlur ?? DEFAULTS.bgBlur,
    glassEnabled: glassEnabled ?? DEFAULTS.glassEnabled,
    glassOpacity: glassOpacity ?? DEFAULTS.glassOpacity,
    glassBlur: glassBlur ?? DEFAULTS.glassBlur,
  };

  applyCSS(settings);
  broadcast(settings);
  return settings;
}

export async function saveThemeBgImage(dataUri: string): Promise<void> {
  await setItem(BG_IMAGE_KEY, dataUri);
  const settings = {
    bgImage: dataUri,
    bgOpacity: parseFloat(document.documentElement.style.getPropertyValue('--bg-image-opacity')) || DEFAULTS.bgOpacity,
    bgBlur: parseInt(document.documentElement.style.getPropertyValue('--bg-image-blur')) || DEFAULTS.bgBlur,
    glassEnabled: document.documentElement.classList.contains('glass'),
    glassOpacity: parseFloat(document.documentElement.style.getPropertyValue('--glass-opacity')) || DEFAULTS.glassOpacity,
    glassBlur: parseInt(document.documentElement.style.getPropertyValue('--glass-blur')) || DEFAULTS.glassBlur,
  };
  applyCSS(settings);
  broadcast(settings);
}

export async function saveThemeBgOpacity(value: number): Promise<void> {
  await setItem(BG_OPACITY_KEY, value);
  applyPartialCSS('--bg-image-opacity', String(value));
}

export async function saveThemeBgBlur(value: number): Promise<void> {
  await setItem(BG_BLUR_KEY, value);
  applyPartialCSS('--bg-image-blur', `${value}px`);
}

export async function saveGlassEnabled(enabled: boolean): Promise<void> {
  await setItem(GLASS_ENABLED_KEY, enabled);
  if (enabled) {
    document.documentElement.classList.add('glass');
  } else {
    document.documentElement.classList.remove('glass');
  }
}

export async function saveGlassOpacity(value: number): Promise<void> {
  await setItem(GLASS_OPACITY_KEY, value);
  applyPartialCSS('--glass-opacity', String(value));
}

export async function saveGlassBlur(value: number): Promise<void> {
  await setItem(GLASS_BLUR_KEY, value);
  applyPartialCSS('--glass-blur', `${value}px`);
}

export async function removeThemeBackground(): Promise<void> {
  await Promise.all([
    setItem(BG_IMAGE_KEY, null),
    setItem(BG_OPACITY_KEY, DEFAULTS.bgOpacity),
    setItem(BG_BLUR_KEY, DEFAULTS.bgBlur),
  ]);
  const root = document.documentElement.style;
  root.setProperty('--bg-image-opacity', String(DEFAULTS.bgOpacity));
  root.setProperty('--bg-image-blur', `${DEFAULTS.bgBlur}px`);
  document.body.classList.remove('has-theme-bg');
  broadcast({ ...DEFAULTS, glassEnabled: document.documentElement.classList.contains('glass') });
}

export async function resetAll(): Promise<void> {
  await Promise.all([
    setItem(BG_IMAGE_KEY, null),
    setItem(BG_OPACITY_KEY, DEFAULTS.bgOpacity),
    setItem(BG_BLUR_KEY, DEFAULTS.bgBlur),
    setItem(GLASS_ENABLED_KEY, DEFAULTS.glassEnabled),
    setItem(GLASS_OPACITY_KEY, DEFAULTS.glassOpacity),
    setItem(GLASS_BLUR_KEY, DEFAULTS.glassBlur),
  ]);
  applyCSS(DEFAULTS);
  broadcast(DEFAULTS);
}

function applyPartialCSS(prop: string, value: string) {
  document.documentElement.style.setProperty(prop, value);
}
