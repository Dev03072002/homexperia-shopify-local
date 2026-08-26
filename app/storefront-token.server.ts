import db from "./db.server";

/**
 * Provisions the Storefront API access token that the Homexperia backend uses
 * to query the merchant's products.
 *
 * This replaces the manual Headless/Hydrogen channel setup: the token is
 * delegated the unauthenticated scopes granted to this app, which are declared
 * in shopify.app.production.toml.
 *
 * Shopify does not document whether a token's accessScopes is a snapshot taken
 * at creation or a live view of the app's current grants. Rather than depend on
 * either behaviour, the scope set is recorded alongside the token and compared
 * on every run, so a scope change always produces a fresh token.
 */

const GRANTED_SCOPES_QUERY = `#graphql
  query GrantedScopes {
    currentAppInstallation {
      accessScopes {
        handle
      }
    }
  }
`;

const CREATE_TOKEN_MUTATION = `#graphql
  mutation CreateStorefrontToken($input: StorefrontAccessTokenInput!) {
    storefrontAccessTokenCreate(input: $input) {
      storefrontAccessToken {
        id
        accessToken
        accessScopes {
          handle
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DELETE_TOKEN_MUTATION = `#graphql
  mutation DeleteStorefrontToken($input: StorefrontAccessTokenDeleteInput!) {
    storefrontAccessTokenDelete(input: $input) {
      deletedStorefrontAccessTokenId
      userErrors {
        field
        message
      }
    }
  }
`;

const TOKEN_TITLE = "Homexperia";

type GraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

function normalizeScopes(handles: string[]): string {
  return handles
    .filter((handle) => handle.startsWith("unauthenticated_"))
    .sort()
    .join(",");
}

async function grantedStorefrontScopes(admin: GraphqlClient): Promise<string> {
  const response = await admin.graphql(GRANTED_SCOPES_QUERY);
  const body = await response.json();
  const scopes = body?.data?.currentAppInstallation?.accessScopes ?? [];

  return normalizeScopes(scopes.map((scope: { handle: string }) => scope.handle));
}

/**
 * Creates a Storefront access token if the shop has none, or replaces the
 * existing one if the granted scope set has changed since it was minted.
 *
 * Safe to call repeatedly — a matching token is a no-op, so this can run on
 * install, on scopes_update, and on admin page load without special casing.
 */
export async function ensureStorefrontToken(
  admin: GraphqlClient,
  shop: string,
): Promise<void> {
  const scopes = await grantedStorefrontScopes(admin);

  if (!scopes) {
    throw new Error(
      `No unauthenticated access scopes granted for ${shop}. A Storefront token cannot be created.`,
    );
  }

  const existing = await db.shop.findUnique({ where: { shop } });

  if (existing && existing.storefrontScopes === scopes) {
    return;
  }

  const response = await admin.graphql(CREATE_TOKEN_MUTATION, {
    variables: { input: { title: TOKEN_TITLE } },
  });
  const body = await response.json();
  const result = body?.data?.storefrontAccessTokenCreate;
  const userErrors = result?.userErrors ?? [];

  if (userErrors.length > 0) {
    throw new Error(
      `Could not create a Storefront token for ${shop}: ${userErrors
        .map((error: { message: string }) => error.message)
        .join("; ")}`,
    );
  }

  const created = result?.storefrontAccessToken;

  if (!created?.accessToken || !created?.id) {
    throw new Error(`Shopify returned no Storefront token for ${shop}.`);
  }

  // Commit the new token before removing the old one, so there is never a
  // window where the shop has no usable credential.
  await db.shop.upsert({
    where: { shop },
    create: {
      shop,
      storefrontAccessToken: created.accessToken,
      storefrontTokenGid: created.id,
      storefrontScopes: normalizeScopes(
        (created.accessScopes ?? []).map(
          (scope: { handle: string }) => scope.handle,
        ),
      ) || scopes,
    },
    update: {
      storefrontAccessToken: created.accessToken,
      storefrontTokenGid: created.id,
      storefrontScopes: normalizeScopes(
        (created.accessScopes ?? []).map(
          (scope: { handle: string }) => scope.handle,
        ),
      ) || scopes,
    },
  });

  if (existing?.storefrontTokenGid) {
    await deleteStorefrontToken(admin, existing.storefrontTokenGid);
  }
}

/**
 * Deletes a superseded token. A shop is capped at 100 active tokens per app, so
 * rotation must clean up after itself. Failure here is logged rather than
 * thrown: the new token is already live, and the old one expiring uncleaned is
 * less harmful than reporting provisioning as failed.
 */
async function deleteStorefrontToken(
  admin: GraphqlClient,
  gid: string,
): Promise<void> {
  try {
    const response = await admin.graphql(DELETE_TOKEN_MUTATION, {
      variables: { input: { id: gid } },
    });
    const body = await response.json();
    const userErrors =
      body?.data?.storefrontAccessTokenDelete?.userErrors ?? [];

    if (userErrors.length > 0) {
      console.warn(
        `Could not delete superseded Storefront token: ${userErrors
          .map((error: { message: string }) => error.message)
          .join("; ")}`,
      );
    }
  } catch (error) {
    console.warn("Could not delete superseded Storefront token.", error);
  }
}
