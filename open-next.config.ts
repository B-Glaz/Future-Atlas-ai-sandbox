import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const config = defineCloudflareConfig();
// Must be the Next.js build only. `npm run build` already runs OpenNext.
config.buildCommand = "node scripts/with-public-env.mjs";

export default config;
