export interface WorldCoords {
  id: number;
  cx: number;
  cy: number;
  radius: number;
  depth: number;
  parentId: number | null;
  name: string;
  type: string;
  description: string;
  bookId: number;
  alternateOfId: number | null;
}

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

const RADIUS_RATIO = 0.35;

function clamp(val: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, val));
}

function iterativeCollisionSeparation(
  entries: { child: LocationInput; cx: number; cy: number; radius: number }[],
  parentCx: number,
  parentCy: number,
  parentRadius: number,
): void {
  const margin = parentRadius - (parentRadius * RADIUS_RATIO);
  for (let iter = 0; iter < 50; iter++) {
    let anyOverlap = false;
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i];
        const b = entries[j];
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const dist = Math.hypot(dx, dy);
        if (dist < 1e-6) continue;
        const overlap = a.radius + b.radius - dist;
        if (overlap > 0) {
          anyOverlap = true;
          const push = overlap * 0.55;
          const nx = dx / dist;
          const ny = dy / dist;
          entries[i].cx -= nx * push * 0.5;
          entries[i].cy -= ny * push * 0.5;
          entries[j].cx += nx * push * 0.5;
          entries[j].cy += ny * push * 0.5;
        }
      }
    }
    for (const e of entries) {
      const dx = e.cx - parentCx;
      const dy = e.cy - parentCy;
      const dist = Math.hypot(dx, dy);
      if (dist > margin) {
        const nx = dx / (dist || 1);
        const ny = dy / (dist || 1);
        e.cx = parentCx + nx * margin;
        e.cy = parentCy + ny * margin;
      }
    }
    if (!anyOverlap) break;
  }
}

function radialEquidistantLayout(
  entries: { child: LocationInput; cx: number; cy: number; radius: number }[],
  parentCx: number,
  parentCy: number,
  parentRadius: number,
): void {
  const margin = (parentRadius - (parentRadius * RADIUS_RATIO)) * 0.65;
  const count = entries.length;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * 2 * Math.PI;
    entries[i].cx = parentCx + Math.cos(angle) * margin;
    entries[i].cy = parentCy + Math.sin(angle) * margin;
  }
}

export function getWorldCoords(locations: LocationInput[]): WorldCoords[] {
  if (locations.length === 0) return [];

  const visited = new Set<number>();
  const result: WorldCoords[] = [];
  const locationMap = new Map(locations.map((l) => [l.id, l]));

  const roots = locations.filter((l) => l.parentId === null);
  if (roots.length === 0) return [];

  const mainRoot = roots.reduce((a, b) => (a.id < b.id ? a : b));

  for (let i = 0; i < roots.length; i++) {
    const root = roots[i];
    // 根节点半径 = 基础半径 500 收缩一次（0.35）
    const rootRadius = 500 * RADIUS_RATIO;
    if (root.id === mainRoot.id) {
      buildNode(root, 0, 0, rootRadius, 0, visited, result, locationMap);
    } else {
      const offset = 2000 * i;
      buildNode(root, offset, 0, rootRadius, 0, visited, result, locationMap);
    }
  }

  return result;
}

function buildNode(
  loc: LocationInput,
  cx: number,
  cy: number,
  radius: number,
  depth: number,
  visited: Set<number>,
  accumulator: WorldCoords[],
  locationMap: Map<number, LocationInput>,
): void {
  if (visited.has(loc.id)) return;
  visited.add(loc.id);

  // 位置与半径均由父级布局阶段计算好（含 position 偏移与碰撞分离），
  // 此处直接使用，不再二次收缩半径或重复应用 position 偏移。
  accumulator.push({
    id: loc.id,
    cx,
    cy,
    radius,
    depth,
    parentId: loc.parentId,
    name: loc.name,
    type: loc.type,
    description: loc.description,
    bookId: loc.bookId,
    alternateOfId: loc.alternateOfId,
  });

  const children = Array.from(locationMap.values()).filter((l) => l.parentId === loc.id);
  if (children.length === 0) return;

  const childRadius = radius * RADIUS_RATIO;
  const childMargin = radius - childRadius;

  const childEntries = children.map((child) => {
    const cpx = clamp(child.positionX ?? 0.5, 0, 1);
    const cpy = clamp(child.positionY ?? 0.5, 0, 1);
    return {
      child,
      cx: cx + (cpx - 0.5) * 2 * childMargin,
      cy: cy + (cpy - 0.5) * 2 * childMargin,
      radius: childRadius,
    };
  });

  if (childEntries.length <= 7) {
    iterativeCollisionSeparation(childEntries, cx, cy, radius);
  } else {
    radialEquidistantLayout(childEntries, cx, cy, radius);
  }

  for (const entry of childEntries) {
    buildNode(entry.child, entry.cx, entry.cy, entry.radius, depth + 1, visited, accumulator, locationMap);
  }
}

export function getWorldCoordsMap(locations: LocationInput[]): Map<number, WorldCoords> {
  const coords = getWorldCoords(locations);
  return new Map(coords.map((c) => [c.id, c]));
}
