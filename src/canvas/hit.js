import { distance, edgeMidpoint, rotatePoints, centroid } from '../ops/geometry.js';

const VERTEX_RADIUS = 8;
const MIDPOINT_RADIUS = 7;
const ROTATION_RADIUS = 9;

export function pointInPolygon([px, py], points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

export function pointInCircle([px, py], cx, cy, r) {
  return distance([px, py], [cx, cy]) <= r;
}

function shapeEffectivePoints(shape) {
  if (shape.type === 'circle') return null;
  if (shape.type === 'door') {
    return rotatePoints(shape.points, shape.rotation ?? 0, centroid(shape.points));
  }
  return shape.points;
}

export function hitTestShape(shapes, x, y) {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (s.type === 'circle') {
      if (pointInCircle([x, y], s.cx, s.cy, s.radius)) return s;
    } else {
      const pts = shapeEffectivePoints(s);
      if (pts && pointInPolygon([x, y], pts)) return s;
    }
  }
  return null;
}

// x, y are image-space coords; threshold is in image-space (pass screenPx / scale)
export function hitTestVertex(shape, x, y, threshold = VERTEX_RADIUS) {
  if (shape.type === 'circle') {
    if (distance([x, y], [shape.cx + shape.radius, shape.cy]) <= threshold) {
      return { type: 'circle-resize' };
    }
    if (distance([x, y], [shape.cx, shape.cy]) <= threshold) {
      return { type: 'circle-center' };
    }
    return null;
  }
  // For doors, test against rotated vertex positions so handles match visuals
  const pts = shape.type === 'door'
    ? rotatePoints(shape.points, shape.rotation ?? 0, centroid(shape.points))
    : shape.points;
  for (let i = 0; i < pts.length; i++) {
    if (distance([x, y], pts[i]) <= threshold) return { type: 'vertex', index: i };
  }
  return null;
}

export function hitTestMidpoint(shape, x, y, threshold = MIDPOINT_RADIUS) {
  if (shape.type === 'circle' || shape.type === 'door') return null;
  const pts = shape.points;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const mid = edgeMidpoint(pts[i], pts[j]);
    if (distance([x, y], mid) <= threshold) return { type: 'midpoint', edgeIndex: i };
  }
  return null;
}

export function hitTestRotationHandle(shape, x, y, viewport, threshold = ROTATION_RADIUS) {
  if (shape.type !== 'door') return false;
  const c = centroid(shape.points);
  const handleImg = [c[0], c[1] - 28];
  const rotated = rotatePoints([handleImg], shape.rotation ?? 0, c)[0];
  const screenPt = imgToScreen(rotated, viewport);
  return distance([x, y], screenPt) <= threshold;
}

function imgToScreen([ix, iy], { x, y, scale }) {
  return [ix * scale + x, iy * scale + y];
}

export function isInRevealedRegion(px, py, shapes, fowState) {
  return shapes.some(s => {
    if (s.type === 'door') return false;
    if (!fowState.get(s.id)) return false;
    if (s.type === 'circle') return pointInCircle([px, py], s.cx, s.cy, s.radius);
    return pointInPolygon([px, py], s.points);
  });
}

export function isDoorVisible(door, shapes, fowState) {
  const rotated = rotatePoints(door.points, door.rotation ?? 0, centroid(door.points));
  return rotated.some(pt => isInRevealedRegion(pt[0], pt[1], shapes, fowState));
}
