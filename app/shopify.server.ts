import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { ensureStorefrontToken } from "./storefront-token.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    // Required: public apps must use expiring offline access tokens. Apps
    // created on or after 2026-04-01 must use them, and from 2027-01-01
    // Admin API requests made with non-expiring tokens are rejected.
    expiringOfflineAccessTokens: true,
  },
  hooks: {
    // Provision the Storefront token once, right after install completes.
    // Failure must not break installation — the merchant lands on the app and
    // the status page offers a retry.
    afterAuth: async ({ session, admin }) => {
      try {
        await ensureStorefrontToken(admin, session.shop);
      } catch (error) {
        console.error(
          `Storefront token provisioning failed for ${session.shop}`,
          error,
        );
      }
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
