// tests/map/coordinates.test.ts
// 地图坐标布局纯函数测试：getWorldCoords / getWorldCoordsMap
// 覆盖：空输入、无根节点、根节点偏移、子节点位置计算、大量子节点径向布局、循环引用、position 边界 clamp
import { describe, expect, it } from 'vitest';
import { getWorldCoords, getWorldCoordsMap } from '@/features/map/utils/coordinates';

interface LocationInput {
  id: number;
  parentId: number | null;
  name: string;
  type: string;
  description: string;
  positionX: number | null;
  positionY: number | null;
  bookId: number;
  alternateOfId: number | null;
}

const makeLoc = (id: number, parentId: number | null = null, pos: [number | null, number | null] = [null, null]): LocationInput => ({
  id,
  parentId,
  name: `地点${id}`,
  type: 'town',
  description: '',
  positionX: pos[0],
  positionY: pos[1],
  bookId: 1,
  alternateOfId: null,
});

describe('getWorldCoords', () => {
  it('空数组返回空列表', () => {
    expect(getWorldCoords([])).toEqual([]);
  });

  it('没有根节点（全部有 parentId）返回空列表', () => {
    const locs = [makeLoc(2, 1), makeLoc(3, 2)];
    expect(getWorldCoords(locs)).toEqual([]);
  });

  it('单根节点位于原点，半径按 0.35 比例收缩', () => {
    const coords = getWorldCoords([makeLoc(1)]);
    expect(coords).toHaveLength(1);
    expect(coords[0]).toMatchObject({ id: 1, cx: 0, cy: 0, depth: 0, radius: 175 });
  });

  it('多个根节点：最小 id 在原点，其余按 2000*i 偏移（i 为 roots 数组索引）', () => {
    const coords = getWorldCoords([makeLoc(1), makeLoc(3), makeLoc(5)]);
    expect(coords).toHaveLength(3);
    const byId = Object.fromEntries(coords.map((c) => [c.id, c]));
    expect(byId[1]).toMatchObject({ cx: 0, cy: 0 });
    expect(byId[3]).toMatchObject({ cx: 2000, cy: 0 });
    expect(byId[5]).toMatchObject({ cx: 4000, cy: 0 });
  });

  it('子节点按 position 比例落在父节点内部，position 缺省取中心', () => {
    const coords = getWorldCoords([makeLoc(1), makeLoc(2, 1)]);
    const child = coords.find((c) => c.id === 2)!;
    // 深度每 +1 半径乘一次 0.35：depth1 = 500 * 0.35^2 = 61.25
    expect(child).toMatchObject({ id: 2, cx: 0, cy: 0, depth: 1 });
    expect(child.radius).toBeCloseTo(500 * 0.35 * 0.35, 5);
  });

  it('position 边界值被 clamp 到 [0,1]，子节点不越出父区域', () => {
    const coords = getWorldCoords([makeLoc(1), makeLoc(2, 1, [2, -1])]);
    const child = coords.find((c) => c.id === 2)!;
    // clamp 后 position=(1,0)：cx 为正方向，且整圆不越过父半径 175
    expect(child.cx).toBeGreaterThan(0);
    expect(child.cy).toBeLessThan(0);
    expect(Math.hypot(child.cx, child.cy) + child.radius).toBeLessThanOrEqual(175 + 1e-6);
  });

  it('超过 7 个子节点时退化为径向等距布局（所有子节点与父中心等距）', () => {
    const locs = [makeLoc(1), ...Array.from({ length: 10 }, (_, i) => makeLoc(100 + i, 1))];
    const coords = getWorldCoords(locs);
    const children = coords.filter((c) => c.id >= 100);
    expect(children).toHaveLength(10);
    const distances = children.map((c) => Math.hypot(c.cx, c.cy));
    const first = distances[0];
    for (const d of distances) {
      expect(Math.abs(d - first)).toBeLessThan(1e-6);
    }
  });

  it('重复 id 输入不会重复展开（visited 去重，防御死循环）', () => {
    // 同一 id 出现两次（父级数据异常时可能发生），locationMap 以 id 覆盖，visited 保证不重复处理
    const locs = [makeLoc(1), makeLoc(1), makeLoc(2, 1), makeLoc(3, 2)];
    const coords = getWorldCoords(locs);
    const ids = coords.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(3);
    // 三层深度链完整
    expect(coords.find((c) => c.id === 3)?.depth).toBe(2);
  });
});

describe('getWorldCoordsMap', () => {
  it('返回以 id 为键的 Map', () => {
    const map = getWorldCoordsMap([makeLoc(1), makeLoc(2, 1)]);
    expect(map.size).toBe(2);
    expect(map.get(1)?.depth).toBe(0);
    expect(map.get(2)?.depth).toBe(1);
  });
});
