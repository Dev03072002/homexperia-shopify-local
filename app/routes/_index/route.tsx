import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // Shopify-owned surfaces (the Admin and the App Store) arrive with a shop
  // parameter, so installs and app opens continue straight into the embedded
  // app. Anything else falls through to the notice below rather than offering
  // a way to start installation from here.
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export default function Index() {
  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Homexperia Room Visualisation</h1>
        <p className={styles.text}>
          Open Homexperia from your Shopify admin to manage the app.
        </p>
      </div>
    </div>
  );
}
