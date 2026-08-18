import { timingSafeEqual } from "node:crypto";
import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";

/**
 * Server-to-server endpoint for the Homexperia backend.
 *
 * Given a shop domain, returns the Storefront API access token this app
 * provisioned for that store. Authenticated with a shared secret that exists
 * only in this server's environment — it is never sent to a browser, a theme,
 * or the theme app extension.
 *
 * POST rather than GET: the response body is a credential, and GET URLs end up
 * in access logs, proxy logs, and referrer headers.
 */

const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // A credential response must never be stored by an intermediary.
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Constant-time secret comparison. A plain === leaks the position of the first
 * differing byte through timing, which makes a shared secret guessable.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

function presentedSecret(request: Request): string | null {
  const header = request.headers.get("authorization");

  if (!header) {
    return null;
  }

  const [scheme, ...rest] = header.split(" ");

  if (scheme.toLowerCase() !== "bearer" || rest.length === 0) {
    return null;
  }

  return rest.join(" ").trim();
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const expected = process.env.HOMEXPERIA_API_SECRET;

  if (!expected) {
    // Refuse rather than fall open if the server is misconfigured.
    console.error("HOMEXPERIA_API_SECRET is not set; refusing token requests.");
    return json({ error: "Not configured" }, 503);
  }

  const provided = presentedSecret(request);

  // Authenticate before reading the body, so an unauthenticated caller learns
  // nothing about which shops exist.
  if (!provided || !secretMatches(provided, expected)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let shop: unknown;

  try {
    const body = await request.json();
    shop = (body as { shop?: unknown })?.shop;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (typeof shop !== "string" || !SHOP_DOMAIN.test(shop.toLowerCase())) {
    return json({ error: "Invalid shop domain" }, 400);
  }

  const record = await db.shop.findUnique({
    where: { shop: shop.toLowerCase() },
  });

  // One generic 404 for "never installed", "uninstalled", and "not yet
  // provisioned". Distinguishing them would let a caller holding the secret
  // enumerate which stores use Homexperia.
  if (!record) {
    return json({ error: "Not found" }, 404);
  }

  return json(
    {
      shop: record.shop,
      storefrontAccessToken: record.storefrontAccessToken,
    },
    200,
  );
};

// Reject GET explicitly so a browser hitting the URL cannot receive a
// credential, and so the route does not fall through to an HTML response.
export const loader = async () => {
  return json({ error: "Method not allowed" }, 405);
};
