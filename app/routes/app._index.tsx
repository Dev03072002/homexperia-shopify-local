import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { ensureStorefrontToken } from "../storefront-token.server";

/**
 * Minimal status page. Shopify requires an app's state and settings to be
 * reachable from the Shopify admin, and merchants need to know whether setup
 * completed. It reports status and offers a retry — nothing more.
 *
 * The Storefront token is never sent to this page.
 */

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  // A database read rather than an API call, so opening the app stays cheap.
  const record = await db.shop.findUnique({
    where: { shop: session.shop },
    select: { shop: true },
  });

  return {
    shop: session.shop,
    provisioned: record !== null,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    await ensureStorefrontToken(admin, session.shop);
    return { ok: true, error: null };
  } catch (error) {
    console.error(`Storefront token retry failed for ${session.shop}`, error);
    return {
      ok: false,
      error: "Could not reach Shopify's Storefront API. Please try again.",
    };
  }
};

export default function Index() {
  const { shop, provisioned } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const connected = provisioned || fetcher.data?.ok === true;

  return (
    <s-page heading="Homexperia">
      <s-section heading="Storefront connection">
        <s-paragraph>
          {connected
            ? `${shop} is connected. Homexperia can read this store's product data.`
            : `${shop} is not connected yet. Homexperia cannot read this store's product data until setup completes.`}
        </s-paragraph>

        {fetcher.data?.error ? (
          <s-paragraph>{fetcher.data.error}</s-paragraph>
        ) : null}

        {connected ? null : (
          <s-button onClick={() => fetcher.submit({}, { method: "POST" })}>
            Retry setup
          </s-button>
        )}
      </s-section>

      <s-section heading="Show the button on your product pages">
        <s-paragraph>
          Turn on the Homexperia app embed in your theme, then choose the button
          text and where it appears.
        </s-paragraph>
        <s-link
          href={`https://${shop}/admin/themes/current/editor?context=apps`}
          target="_blank"
        >
          Open theme editor
        </s-link>
      </s-section>

      <s-section heading="Product images">
        <s-paragraph>
          Homexperia reads each product&apos;s{" "}
          <code>custom.homexperia_image</code> metafield. Products without it
          will not show a room preview. Set it up under Settings &rsaquo; Custom
          data &rsaquo; Products, and make sure storefront access is enabled for
          the metafield.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
