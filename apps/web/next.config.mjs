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
};

export default withMDX(nextConfig);
