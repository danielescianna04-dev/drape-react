export const IAP_PRODUCT_IDS = {
  GO_MONTHLY: 'com.drape.app.go.monthly.v2',
  GO_YEARLY: 'com.drape.app.go.yearly.v2',
  PRO_MONTHLY: 'com.drape.app.pro.monthly.v2',
  PRO_YEARLY: 'com.drape.app.pro.yearly.v2',
} as const;

export const ALL_PRODUCT_IDS = [
  IAP_PRODUCT_IDS.GO_MONTHLY,
  IAP_PRODUCT_IDS.GO_YEARLY,
  IAP_PRODUCT_IDS.PRO_MONTHLY,
  IAP_PRODUCT_IDS.PRO_YEARLY,
];

export const PRODUCT_TO_PLAN: Record<string, 'go' | 'pro'> = {
  [IAP_PRODUCT_IDS.GO_MONTHLY]: 'go',
  [IAP_PRODUCT_IDS.GO_YEARLY]: 'go',
  [IAP_PRODUCT_IDS.PRO_MONTHLY]: 'pro',
  [IAP_PRODUCT_IDS.PRO_YEARLY]: 'pro',
};

export function getProductId(
  plan: 'go' | 'pro',
  cycle: 'monthly' | 'yearly',
): string {
  if (plan === 'go') {
    return cycle === 'monthly' ? IAP_PRODUCT_IDS.GO_MONTHLY : IAP_PRODUCT_IDS.GO_YEARLY;
  }
  return cycle === 'monthly' ? IAP_PRODUCT_IDS.PRO_MONTHLY : IAP_PRODUCT_IDS.PRO_YEARLY;
}
