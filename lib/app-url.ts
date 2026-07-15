/**
 * Base URL of the Next.js app (which hosts the workflow + relay routes).
 *
 * eve runs as its own server and rewrites to Next, so eve tools reach the Next
 * app over HTTP at this origin. On Vercel it's the deployment URL; locally it's
 * the Next dev port.
 */
export function appUrl(): string {
  if (process.env.EVE_HOST) return process.env.EVE_HOST;
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;
  return `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
}
