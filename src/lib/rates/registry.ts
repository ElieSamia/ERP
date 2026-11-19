import { DEMO } from './demo';
import type { ProviderMeta } from './types';

/**
 * Every provider the ERP knows how to talk to. Adding a real API means writing its connector file and listing it
 * here; it then appears under Rates → Connections, ready for its credentials.
 */
export const PROVIDERS: ProviderMeta[] = [DEMO];
export const providerMeta = (id: string) => PROVIDERS.find((p) => p.id === id);
