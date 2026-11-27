export const APP_NAME = "inkvault";
export const SCHEMA_VERSION = 1;

export interface VaultData {
  app: typeof APP_NAME;
  schema: number;
  updatedAt: string;
  [key: string]: unknown;
}

export function emptyVaultData(now: string = new Date().toISOString()): VaultData {
  return { app: APP_NAME, schema: SCHEMA_VERSION, updatedAt: now };
}
