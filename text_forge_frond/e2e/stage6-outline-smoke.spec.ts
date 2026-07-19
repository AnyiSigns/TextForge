import { test, expect, type Page } from '@playwright/test';

// 六阶段冒烟：角色图 → 大纲节点 二级定位插入（验证 OutlinePanel 持久化竞态修复）
const APP = 'http://localhost:3000';
const PID = 'dev-p-1'; // mock 预置项目「星海拾遗」，含角色林墨(有图)

async function loginMock(page: Page) {
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.locator('#email').fill('dev@textforge.local');
  await page.locator('#password').fill('123456');
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => u.pathname === '/', { timeout: 40000 });
  await page.waitForLoadState('networkidle');
}

async function gotoProject(page: Page) {
  await page.goto(`${APP}/projects/${PID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  // 切到「大纲」标签页
  await page.getByRole('button', { name: '大纲', exact: true }).click();
  await page.waitForTimeout(500);
}

test('六阶段：角色图插入大纲节点并持久化（IMG_IN_NODE）', async ({ page }) => {
  await loginMock(page);

  // 1) 进入项目，建大纲：卷 → 章 → 节点
  await gotoProject(page);
  await page.getByPlaceholder('新卷名，如「第一卷·星海」').waitFor({ state: 'visible', timeout: 30000 });
  await page.getByPlaceholder('新卷名，如「第一卷·星海」').fill('冒烟卷');
  await page.getByPlaceholder('新卷名，如「第一卷·星海」').press('Enter');
  await page.waitForTimeout(500);
  await page.getByPlaceholder('新章名，如「第一章·星海初现」').first().fill('冒烟章');
  await page.getByPlaceholder('新章名，如「第一章·星海初现」').first().press('Enter');
  await page.waitForTimeout(500);
  await page.getByPlaceholder('新情节节点').first().fill('冒烟节点');
  await page.getByPlaceholder('新情节节点').first().press('Enter');
  await page.waitForTimeout(500);

  // 2) 去角色页，找林墨的图，插入到大纲节点
  await page.goto(`${APP}/characters`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  const pinBtn = page.getByTitle('插入到正文/大纲').first();
  await expect(pinBtn).toBeVisible({ timeout: 20000 });
  await pinBtn.click();
  await page.waitForTimeout(600);
  const outlineNodeBtn = page.getByRole('button', { name: /冒烟卷 \/ 冒烟章 \/ 冒烟节点/ }).first();
  await expect(outlineNodeBtn).toBeVisible({ timeout: 15000 });
  await outlineNodeBtn.click();
  await page.waitForTimeout(1500);

  // 3) 回项目大纲页，验证节点 content 含角色图 markdown（确认持久化竞态修复）
  await gotoProject(page);
  await page.waitForTimeout(800);
  const nodeContent = page.getByPlaceholder('情节要点 / 摘要…').first();
  await expect(nodeContent).toHaveValue(/!\[.*\]\(.*\)/, { timeout: 15000 });
});
