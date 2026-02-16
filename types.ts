
export interface Coordinates {
  lat: number;
  lng: number;
}

export enum CollectionStatus {
  COLLECT = 'COLLECT NOW',
  SKIP = 'SKIP',
  FULL = 'FULL (90%+)',
  SMELLY = 'GAS ALERT',
  OK = 'NORMAL'
}

export interface Dustbin {
  id: string;
  name: string;
  location: Coordinates;
  level: number; // 0-100%
  smell: number; // MQ2 ppm value
  lastUpdated: string;
  lastSeenTimestamp: number; // Unix timestamp for heartbeat
  isIotDevice: boolean;
}

export interface RouteOptimizationResult {
  optimizedOrder: string[];
  explanation: string;
}
