declare module 'd3-force-3d' {
  export function forceSimulation<T extends { x?: number; y?: number; z?: number; vx?: number; vy?: number; vz?: number }>(nodes?: T[]): any;
  export function forceLink<T>(links?: T[]): any;
  export function forceManyBody(): any;
  export function forceCenter(x?: number, y?: number, z?: number): any;
  export function forceCollide(radius?: number | ((node: any) => number)): any;
}
