import type { EntitlementGateway } from './EntitlementGateway';
import { FREE_SNAPSHOT } from './entitlementModel';

// Webでは課金しない(iPhone版MVP)。常にFree扱いで、購入・復元は不可。
export const purchasesGateway: EntitlementGateway = {
  configure: async () => false,
  logIn: async () => FREE_SNAPSHOT,
  logOut: async () => {},
  getSnapshot: async () => FREE_SNAPSHOT,
  getPlans: async () => [],
  purchase: async () => ({ status: 'failed', reason: 'store' }),
  restore: async () => ({ status: 'failed', reason: 'store' }),
  subscribe: () => () => {},
};
