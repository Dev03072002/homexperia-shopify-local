import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * Mandatory compliance webhook: a store owner has requested deletion of a
 * customer's data on their behalf.
 *
 * This app stores no customer data, so there is nothing to redact. The handler
 * verifies the HMAC and confirms receipt, which is what Shopify requires.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}: no customer data to redact`);

  return new Response();
};
