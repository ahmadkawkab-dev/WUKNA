/** W → faceted prism → full turn → W geometry, shared with the review. */
import { brandFaces } from './geometry';
type Point2 = readonly [number, number];
type Point3 = readonly [number, number, number];
export const prismDuration = 8000;
export const prismSpinStart = 2400;
export const prismSpinEnd = 5200;
const center = [300, 304];
// Canonical W vertices, including the original rounded tip controls.
const start = {
  ltip: [103,159], ltop: [198,204], lcrease: [255,308], lbottom: [184,442],
  lcap: [95,168], lcontrol: [91,155], top: [300,247], joint: [300,391],
  rcrease: [347,309], rtop: [404,204], rinner: [402,350], rtip: [495,159],
  rcontrol: [510,154], rcap: [505,170], rbottom: [415,442], foot: [331,442],
} as const;
// A real rectangular prism in isometric projection. Three visible surfaces
// are subdivided into the same eight opaque faces as the source W.
const cube = {
  a: [-1,1,-1], b: [1,1,-1], c: [1,-1,-1], d: [1,-1,1],
  e: [-1,-1,1], f: [-1,1,1], o: [1,1,1],
  s: [1,0,-1], p: [1,0,0], r: [1,-1,0],
} as const;
type Vertex = keyof typeof start;
const end: Record<Vertex, keyof typeof cube> = {
  ltip: 'e', ltop: 'e', lcrease: 'f', lbottom: 'd', lcap: 'e', lcontrol: 'e',
  top: 'a', joint: 'o', rcrease: 'b', rtop: 's', rinner: 'p',
  rtip: 'c', rcontrol: 'c', rcap: 'c', rbottom: 'r', foot: 'd',
};
export const prismFaceIds = brandFaces.map(face => face.id);
// The reverse sides are needed for a complete 3D turn. They reuse the existing
// fold tones and stay hidden throughout the W/folding/unfolding phases.
export const prismBackFaces = [0, 1, 4, 5, 6, 7].map(index => ({ index, id: brandFaces[index].id }));
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t*t*t*(t*(t*6-15)+10); };
const loopTime = (time: number) => ((time % prismDuration) + prismDuration) % prismDuration;
export function prismFoldAt(time: number) {
  const t = loopTime(time);
  if (t < 600) return 0;
  if (t < 2200) return smooth((t-600)/1600);
  if (t < 5400) return 1;
  if (t < 7100) return 1-smooth((t-5400)/1700);
  return 0;
}
export function prismPhaseAt(time: number) {
  const t = loopTime(time);
  return t<600||t>=7100 ? 'Open W' : t<2200 ? 'Folding inward' : t<2400 ? 'Folded prism' : t<5200 ? 'Full prism turn' : t<5400 ? 'Folded prism' : 'Unfolding';
}
export const prismYawAt = (time: number) => smooth((loopTime(time)-prismSpinStart)/(prismSpinEnd-prismSpinStart))*Math.PI*2;
function project([x,y,z]: Point3, yaw: number): Point2 {
  const rx = x*Math.cos(yaw)-z*Math.sin(yaw), rz=x*Math.sin(yaw)+z*Math.cos(yaw);
  return [center[0]+(rx-rz)*59, center[1]+(rx+rz)*29.5-y*59];
}
export function prismPathsAt(time: number) {
  const fold = prismFoldAt(time);
  const yaw = prismYawAt(time);
  const points = new Map<Vertex, Point2>();
  for (const name of Object.keys(start) as Vertex[]) {
    const [x,y] = start[name];
    const target = project(cube[end[name]], yaw);
    // Shared vertices follow shared arcs: connected folds do not tear apart.
    const lift = -Math.sin(Math.PI*fold)*18*Math.min(1, Math.abs(x-300)/205);
    points.set(name,[x+(target[0]-x)*fold,y+(target[1]-y)*fold+lift]);
  }
  return pathsFor(points);
}
function pathsFor(points: Map<Vertex, Point2>) {
  const p = (name: Vertex) => points.get(name)!.map(v=>Number(v.toFixed(4))).join(' ');
  return [
    `M${p('ltip')} L${p('ltop')} L${p('lcrease')} L${p('lbottom')} L${p('lcap')} Q${p('lcontrol')} ${p('ltip')} Z`,
    `M${p('lbottom')} L${p('lcrease')} L${p('joint')} Z`,
    `M${p('lcrease')} L${p('top')} L${p('joint')} Z`,
    `M${p('top')} L${p('rcrease')} L${p('joint')} Z`,
    `M${p('rcrease')} L${p('rtop')} L${p('rinner')} L${p('joint')} Z`,
    `M${p('rtop')} L${p('rtip')} Q${p('rcontrol')} ${p('rcap')} L${p('rbottom')} L${p('rinner')} Z`,
    `M${p('joint')} L${p('rinner')} L${p('rbottom')} Z`,
    `M${p('joint')} L${p('rbottom')} L${p('foot')} Z`,
  ];
}

export function prismFrameAt(time: number) {
  const paths = prismPathsAt(time);
  const folded = prismFoldAt(time) === 1;
  const yaw = prismYawAt(time);
  // Orthographic camera depth is rx + rz: these dot products identify which
  // outward-facing side is visible as the object turns around its vertical axis.
  const facingX = Math.cos(yaw) + Math.sin(yaw);
  const facingZ = Math.cos(yaw) - Math.sin(yaw);
  const visible = paths.map((_, index) => !folded || (index < 2 ? facingZ > 1e-8 : index < 4 || facingX > 1e-8));
  const reverse = (axis: 'x' | 'z') => {
    const points = new Map<Vertex, Point2>();
    for (const name of Object.keys(start) as Vertex[]) {
      const [x, y, z] = cube[end[name]];
      points.set(name, project([axis === 'x' ? -x : x, y, axis === 'z' ? -z : z], yaw));
    }
    return pathsFor(points);
  };
  const backX = folded ? reverse('x') : [];
  const backZ = folded ? reverse('z') : [];
  return { paths, visible, back: prismBackFaces.map(({ index }) => ({
    path: (index < 2 ? backZ : backX)[index] ?? '',
    visible: folded && (index < 2 ? facingZ < -1e-8 : facingX < -1e-8),
  })) };
}
