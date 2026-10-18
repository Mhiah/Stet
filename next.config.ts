import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let phones and other devices on the local network use the dev server (e.g. opening
  // http://192.168.0.3:3000 on a phone). Next.js blocks their scripts by default, which
  // leaves the page visible but unresponsive. Private network ranges only; dev only.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  // Hide the round "N" dev-tools button so it doesn't show during demos. Build and runtime
  // errors still appear on screen.
  devIndicators: false,
};

export default nextConfig;
