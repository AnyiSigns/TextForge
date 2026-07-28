// src/lib/utils/filename.ts

/** 把任意字符串清洗为安全的文件名（去除文件系统非法字符），保留原意 */
export function sanitizeFileName(title: string): string {
  return (title || '未命名项目').replace(/[\\/:*?"<>|]/g, '_');
}
