import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { ensureStorefrontToken } from "../storefront-token.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { admin, payload, session, topic, shop } = await authenticate.webhook(request);
    console.log(`Received ${topic} webhook for ${shop}`);

    const current = payload.current as string[];
    if (session) {
        await db.session.update({
            where: {
                id: session.id
            },
            data: {
                scope: current.toString(),
            },
        });
    }

    // A change to the granted unauthenticated scopes means the existing
    // Storefront token may no longer carry the right permissions, so re-run
    // provisioning. ensureStorefrontToken is a no-op when the scope set is
    // unchanged, which is the common case for authenticated-scope-only changes.
    if (admin) {
        try {
            await ensureStorefrontToken(admin, shop);
        } catch (error) {
            console.error(`Storefront token refresh failed for ${shop}`, error);
        }
    }

    return new Response();
};
