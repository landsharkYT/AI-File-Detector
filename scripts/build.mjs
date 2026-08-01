import { build } from "esbuild";

await build({
  entryPoints: ["src/cli.ts"],
  outfile: "dist/ai-file-detector.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  minify: true,
  sourcemap: false,
  banner: { js: "#!/usr/bin/env node" },
  legalComments: "none"
});
