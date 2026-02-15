
export interface Coordinates {
  lat: number;
  lng: number;
}

export enum CollectionStatus {
  COLLECT = 'COLLECT',
  SKIP = 'SKIP',
  FULL = 'FULL (90%+)',
  SMELLY = 'SMELLY (>150 & 60%+)',
  OK = 'OK'
}

export interface Dustbin {
  id: string;
  name: string;
  location: Coordinates;
  level: number; // 0-100%
  smell: number; // MQ2 ppm value
  lastUpdated: string;
  isIotDevice: boolean;
}

export interface RouteOptimizationResult {
  optimizedOrder: string[];
  explanation: string;
}
