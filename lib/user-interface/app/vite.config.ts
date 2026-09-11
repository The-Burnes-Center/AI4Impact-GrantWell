import { defineConfig } from "vite";
import fs from "fs";
import path from "path";
import react from "@vitejs/plugin-react";

const isDev = process.env.NODE_ENV === "staging";

// Build-time instance selection: `@active-instance` resolves to the one selected instance's
// branding module, so no other instance's identity enters the bundle. Default: neutral core.
const instance = process.env.GRANTWELL_INSTANCE || "neutral";
const activeInstancePath = path.resolve(__dirname, `config/instances/${instance}.ts`);

// Page chrome (header/nav/footer) is swappable per deliverable via `@chrome`. Defaults to the
// neutral core barrel; a deliverable with its own design system sets GRANTWELL_CHROME to its
// chrome barrel path (must export the same OmniHeader/LandingNavbar/AppNavbar/LandingFooter).
const chromePath = process.env.GRANTWELL_CHROME
  ? path.resolve(__dirname, process.env.GRANTWELL_CHROME)
  : path.resolve(__dirname, "config/chrome.ts");

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    "process.env": {},
    // Inject ENVIRONMENT variable for use in client-side code
    "__ENVIRONMENT__": JSON.stringify(process.env.ENVIRONMENT),
    // Build-time instance id — informational (the actual module is chosen by the resolve alias).
    "__GRANTWELL_INSTANCE__": JSON.stringify(instance),
  },
  resolve: {
    alias: {
      "@active-instance": activeInstancePath,
      "@chrome": chromePath,
    },
  },
  plugins: [
    // Plugin to inject ENVIRONMENT variable into HTML
    {
      name: "inject-environment",
      transformIndexHtml(html) {
        const environment = process.env.ENVIRONMENT;
        return html.replace(
          '<head>',
          `<head>\n    <script>window.__ENVIRONMENT__ = ${JSON.stringify(environment)};</script>`
        );
      },
    },
    isDev && {
      name: "aws-exports",
      writeBundle() {
        const outputPath = path.resolve("public/aws-exports.json");

        // Write the modified JSON data to the public folder
        fs.writeFileSync(
          outputPath,
          JSON.stringify(
            {
              aws_project_region: process.env.AWS_PROJECT_REGION,
              aws_cognito_region: process.env.AWS_COGNITO_REGION,
              aws_user_pools_id: process.env.AWS_USER_POOLS_ID,
              aws_user_pools_web_client_id:
                process.env.AWS_USER_POOLS_WEB_CLIENT_ID,
              config: {
                api_endpoint: `https://${process.env.API_DISTRIBUTION_DOMAIN_NAME}/api`,
                websocket_endpoint: `wss://${process.env.API_DISTRIBUTION_DOMAIN_NAME}/socket`,
                rag_enabled: ["T", "t", "true", "True", "TRUE", "1"].includes(
                  process.env.RAG_ENABLED
                ),
                default_embeddings_model: process.env.DEFAULT_EMBEDDINGS_MODEL,
                default_cross_encoder_model:
                  process.env.DEFAULT_CROSS_ENCODER_MODEL,
              },
            },
            null,
            2
          ),
          "utf-8"
        );
      },
    },
    react(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          const rest = id.split("node_modules/").pop() as string;
          const parts = rest.split("/");
          const name = rest.startsWith("@")
            ? `${parts[0]}/${parts[1]}`
            : parts[0];

          if (
            /^(react|react-dom|scheduler|react-router|cookie|set-cookie-parser)$/.test(
              name
            )
          ) {
            return "vendor-react";
          }

          if (
            name === "aws-amplify" ||
            name.startsWith("@aws-amplify/") ||
            name.startsWith("@aws-sdk/") ||
            name.startsWith("@smithy/") ||
            name.startsWith("@aws-crypto/")
          ) {
            return "vendor-aws";
          }

          if (
            /^(micromark|mdast|hast|unist|remark|rehype)/.test(name) ||
            /^(react-markdown|unified|vfile|property-information|character-entities|decode-named-character-reference|markdown-table|longest-streak|zwitch|trim-lines|html-void-elements|stringify-entities|space-separated-tokens|comma-separated-tokens|ccount|devlop|trough|bail)/.test(
              name
            )
          ) {
            return "vendor-markdown";
          }

          if (name === "luxon") return "vendor-luxon";
        },
      },
    },
  },
  server: {
    port: 3000,
  },
  css: {
    preprocessorOptions: {
      scss: {
        includePaths: ["node_modules"],
      },
    },
  },
});
