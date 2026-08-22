/**
 * Deployment health probe.
 *
 * Answers whether this application revision has started and is serving HTTP.
 * Used by the deployment script to decide if a rollout succeeded, and available
 * to Nginx or an uptime check.
 *
 * Deliberately does NOT query the database. Database readiness is already
 * proven earlier in the deploy, because `prisma migrate deploy` runs and must
 * succeed before the container is replaced. Making this probe depend on the
 * database would turn a transient connection blip into a restart loop.
 *
 * Returns no shop data, no configuration, and no version information.
 */
export const loader = async () => {
  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
};
