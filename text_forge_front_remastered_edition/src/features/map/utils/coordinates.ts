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

export function getWorldCoords(
  locations: Array<{
    id: number;
    parentId: number | null;
    name: string;
    type: string;
    description: string;
    positionX: number | null;
    positionY: number | null;
    bookId: number;
    alternateOfId: number | null;
  }>,
): WorldCoords[] {
  if (locations.length === 0) return [];

  const radiusRatio = 0.35;
  const visited = new Set<number>();
  const result: WorldCoords[] = [];
  const locationMap = new Map(locations.map((l) => [l.id, l]));

  const roots = locations.filter((l) => l.parentId === null);
  if (roots.length === 0) return [];

  const mainRoot = roots.reduce((a, b) => (a.id < b.id ? a : b));

  for (let i = 0; i < roots.length; i++) {
    const root = roots[i];
    if (root.id === mainRoot.id) {
      buildNode(root, 0, 0, 500, 0, visited, result, locationMap, radiusRatio);
    } else {
      const offset = 2000 * i;
      buildNode(root, offset, 0, 500, 0, visited, result, locationMap, radiusRatio);
    }
  }

  return result;
}

function buildNode(
  loc: {
    id: number;
    parentId: number | null;
    name: string;
    type: string;
    description: string;
    positionX: number | null;
    positionY: number | null;
    bookId: number;
    alternateOfId: number | null;
  },
  parentCx: number,
  parentCy: number,
  parentRadius: number,
  depth: number,
  visited: Set<number>,
  accumulator: WorldCoords[],
  locationMap: Map<number, typeof loc>,
  radiusRatio: number,
): void {
  if (visited.has(loc.id)) return;
  visited.add(loc.id);

  const posX = loc.positionX ?? 0.5;
  const posY = loc.positionY ?? 0.5;
  const radius = parentRadius * radiusRatio;

  const cx = parentCx + (posX - 0.5) * 2 * parentRadius;
  const cy = parentCy + (posY - 0.5) * 2 * parentRadius;

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
  for (const child of children) {
    buildNode(child, cx, cy, radius, depth + 1, visited, accumulator, locationMap, radiusRatio);
  }
}

export function getWorldCoordsMap(
  locations: Array<{
    id: number;
    parentId: number | null;
    name: string;
    type: string;
    description: string;
    positionX: number | null;
    positionY: number | null;
    bookId: number;
    alternateOfId: number | null;
  }>,
): Map<number, WorldCoords> {
  const coords = getWorldCoords(locations);
  return new Map(coords.map((c) => [c.id, c]));
}
