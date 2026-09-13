export const PLATFORMS = ["incident", "instatus", "atlassian", "generic", "wake", "shopify", "cloudflare"] as const;
export type Platform = (typeof PLATFORMS)[number];
