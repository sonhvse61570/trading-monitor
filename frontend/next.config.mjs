/** @type {import('next').NextConfig} */
const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

const nextConfig = {
  output: "standalone",
  async rewrites() {
    // Proxy REST API calls to the FastAPI backend (avoids CORS in dev).
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
