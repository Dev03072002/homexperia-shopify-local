import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * Mandatory compliance webhook: a customer has requested the data this app
 * holds about them.
 *
 * This app stores no customer or order data — only a shop domain and the
 * Storefront token provisioned for it — so there is nothing to disclose. The
 * handler is still required, must verify the HMAC, and must answer.
 *
 * authenticate.webhook throws a 401 Response on an invalid HMAC, which Shopify
 * requires and tests for during app review.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}: no customer data stored`);

  return new Response();
};
