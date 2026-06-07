export function centroid(points) {
  let x = 0, y = 0;
  for (const [px, py] of points) { x += px; y += py; }
  return [x / points.length, y / points.length];
}

export function distance(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function edgeMidpoint(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

export function rotatePoints(points, angle, origin) {
  const [ox, oy] = origin;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return points.map(([x, y]) => {
    const dx = x - ox, dy = y - oy;
    return [ox + dx * cos - dy * sin, oy + dx * sin + dy * cos];
  });
}

export function rectFromCorners(p1, p2) {
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
}

export function scaleRectFromAnchor(anchor, cursor) {
  const [ax, ay] = anchor;
  const [cx, cy] = cursor;
  return [[ax, ay], [cx, ay], [cx, cy], [ax, cy]];
}

export function boundingBox(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function circleToPolygon(cx, cy, r, segments = 32) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}
