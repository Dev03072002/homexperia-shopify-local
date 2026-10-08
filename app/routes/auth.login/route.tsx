import { AppProvider } from "@shopify/shopify-app-react-router/react";
import type { LoaderFunctionArgs } from "react-router";

import { login } from "../../shopify.server";

/**
 * Login route without a shop-domain form.
 *
 * App Store requirement 2.3.1 prohibits asking merchants to type a shop domain
 * during installation or configuration, so no form is rendered here.
 *
 * The route itself is kept rather than deleted, for two reasons:
 *   - login() still completes authentication when a Shopify-owned surface
 *     sends a shop parameter, so legitimate entry keeps working.
 *   - Without this file, /auth/login would fall through to the auth.$ splat,
 *     which calls authenticate.admin(). The library explicitly rejects that
 *     from the configured login path and throws a 500.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Throws a redirect into authentication when a shop parameter is present.
  // Otherwise it returns errors, which are deliberately not surfaced as a
  // form the merchant could type into.
  await login(request);

  return null;
};

export default function Auth() {
  return (
    <AppProvider embedded={false}>
      <s-page>
        <s-section heading="Homexperia Room Visualisation">
          <s-paragraph>
            Open Homexperia from your Shopify admin to manage the app.
          </s-paragraph>
        </s-section>
      </s-page>
    </AppProvider>
  );
}
