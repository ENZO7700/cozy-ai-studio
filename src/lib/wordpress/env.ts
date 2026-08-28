/** Server-only WP CCT env (never VITE_ for secrets). */

export type WpCctEnv = {
  baseUrl: string;
  username: string;
  appPassword: string;
  mirror: boolean;
};

export function getWpCctEnv(): WpCctEnv {
  const baseUrl = (
    process.env.WP_BASE_URL ||
    process.env.WP_CCT_BASE_URL ||
    "http://localhost:4422"
  )
    .trim()
    .replace(/\/$/, "");
  const username = (process.env.WP_USERNAME || process.env.WP_IMPORT_USERNAME || "admin").trim();
  const appPassword = (
    process.env.WP_APP_PASSWORD ||
    process.env.WP_IMPORT_APP_PASSWORD ||
    ""
  ).trim();
  const mirror =
    process.env.WP_CCT_MIRROR === "true" ||
    appPassword === "local-cct-mirror" ||
    appPassword === "";

  return { baseUrl, username, appPassword, mirror };
}
