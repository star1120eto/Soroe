import Purchases, { type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';
import { Platform } from 'react-native';
import { PREMIUM_PRODUCT_IDS } from '@soroe/shared';

import { env } from '@/config/env';

import type { EntitlementGateway } from './EntitlementGateway';
import {
  classifyPurchaseError,
  planKindForProduct,
  toEntitlementSnapshot,
  toRestoreOutcome,
  type PurchasablePlan,
} from './entitlementModel';

let configured = false;
// logIn/logOutはconfigure後でないと呼べないため、設定の有無でガードする。
const iosKey = () => (Platform.OS === 'ios' ? env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY : undefined);

async function currentPackages(): Promise<PurchasesPackage[]> {
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export const purchasesGateway: EntitlementGateway = {
  async configure() {
    if (configured) return true;
    const apiKey = iosKey();
    if (!apiKey) return false;
    Purchases.configure({ apiKey });
    configured = true;
    return true;
  },

  async logIn(uid) {
    const { customerInfo } = await Purchases.logIn(uid);
    return toEntitlementSnapshot(customerInfo);
  },

  async logOut() {
    // 匿名IDのときにlogOutするとSDKがエラーを返すため、既にログアウト済みなら何もしない。
    if (await Purchases.isAnonymous()) return;
    await Purchases.logOut();
  },

  async getSnapshot() {
    return toEntitlementSnapshot(await Purchases.getCustomerInfo());
  },

  async getPlans() {
    try {
      const wanted = Object.values<string>(PREMIUM_PRODUCT_IDS);
      return (await currentPackages())
        .filter((pkg) => wanted.includes(pkg.product.identifier))
        .flatMap((pkg): PurchasablePlan[] => {
          const kind = planKindForProduct(pkg.product.identifier);
          return kind ? [{ kind, productId: pkg.product.identifier, priceString: pkg.product.priceString }] : [];
        });
    } catch (error) {
      console.error('getPlans failed', error);
      return [];
    }
  },

  async purchase(productId) {
    try {
      const target = (await currentPackages()).find((pkg) => pkg.product.identifier === productId);
      if (!target) return { status: 'failed', reason: 'store' };
      const { customerInfo } = await Purchases.purchasePackage(target);
      return { status: 'purchased', snapshot: toEntitlementSnapshot(customerInfo) };
    } catch (error) {
      return classifyPurchaseError(error);
    }
  },

  async restore() {
    try {
      return toRestoreOutcome(toEntitlementSnapshot(await Purchases.restorePurchases()));
    } catch (error) {
      const outcome = classifyPurchaseError(error);
      return outcome.status === 'failed' ? outcome : { status: 'failed', reason: 'unknown' };
    }
  },

  subscribe(listener) {
    const handler = (info: CustomerInfo) => listener(toEntitlementSnapshot(info));
    Purchases.addCustomerInfoUpdateListener(handler);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(handler);
    };
  },
};
