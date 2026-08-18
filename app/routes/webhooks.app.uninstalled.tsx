import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  // Removing the shop record is what stops /api/storefront-token serving this
  // shop's credential. Shopify invalidates the app's Admin token on uninstall,
  // so the Storefront token cannot be deleted through the API at this point —
  // dropping our record is the control that actually revokes access.
  // deleteMany rather than delete so a repeat delivery is not an error.
  await db.shop.deleteMany({ where: { shop } });

  return new Response();
};
