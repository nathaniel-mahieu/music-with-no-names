import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const githubPagesBasePath = "/music-with-no-names";

const nextConfig: NextConfig = {
  output: isGitHubPages ? "export" : undefined,
  // Vinext's static prerenderer requests `/`; assetPrefix is sufficient because
  // this app has one route and all lab navigation happens client-side.
  basePath: "",
  assetPrefix: isGitHubPages ? githubPagesBasePath : "",
  trailingSlash: isGitHubPages,
  images: { unoptimized: true },
};

export default nextConfig;
