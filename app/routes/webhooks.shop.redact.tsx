import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * Mandatory compliance webhook: delete this shop's data. Delivered 48 hours
 * after the app is uninstalled.
 *
 * Unlike the two customer topics, this one has real work: remove the shop's
 * record and any session rows. app/uninstalled normally clears both already, so
 * this is the backstop for the case where that webhook was missed.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  await db.shop.deleteMany({ where: { shop } });
  await db.session.deleteMany({ where: { shop } });

  return new Response();
};
