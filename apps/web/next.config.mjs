import createMDX from "@next/mdx";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";

const withMDX = createMDX({
  options: {
    remarkPlugins: [remarkGfm],
    rehypePlugins: [rehypeSlug],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["caelus", "caelus-wheel", "caelus-mcp"],
  pageExtensions: ["ts", "tsx", "md", "mdx"],
  // Let CI/preflight build into a separate dir (NEXT_DIST_DIR=.next-ci) so a
  // `next build` never clobbers the `.next` a running `next dev` depends on.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The /api/mcp function loads caelus-mcp, which reads a few files at runtime
  // (its own version, the accuracy tables) via relative/package requires. Those
  // aren't on the static import graph, so the file tracer misses them and they'd
  // be absent from the serverless bundle -- the server then reports version
  // 0.0.0 and the accuracy resource degrades to null. Force them in. Globs are
  // relative to this app dir; they land in the function at their monorepo-root
  // path, matching where caelus-mcp's requires resolve them.
  outputFileTracingIncludes: {
    "/api/mcp": [
      "../../packages/caelus-mcp/package.json",
      "../../packages/caelus/accuracy.json",
      "../../packages/caelus/horizons-accuracy.json",
    ],
  },
};

export default withMDX(nextConfig);
