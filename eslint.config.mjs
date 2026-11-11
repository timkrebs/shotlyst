import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The service-role client bypasses Row Level Security. Only token links, cron
// and the invitation actions may import it (CLAUDE.md rule 7).
const adminImport = {
  patterns: [
    {
      group: ["@/lib/supabase/admin", "**/lib/supabase/admin"],
      message:
        "The service-role client may be imported only by app/share, app/api/share, app/api/cron and features/members/actions.ts.",
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-imports": ["error", adminImport],
      "@typescript-eslint/no-explicit-any": "error",
      // Files come from private storage through short-lived signed URLs, which
      // the image optimizer must not cache.
      "@next/next/no-img-element": "off",
    },
  },
  {
    files: [
      "src/app/share/**",
      "src/app/api/share/**",
      "src/app/api/cron/**",
      "src/features/members/actions.ts",
    ],
    rules: { "no-restricted-imports": "off" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/lib/db.types.ts",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
