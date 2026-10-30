import type { NextConfig } from "next";

// Prefijo de ruta opcional para servir la app bajo un subpath (p. ej. el proxy del IDE: /absproxy/3000).
// Vacío por defecto (local directo y AWS).
const basePath = process.env.NEXT_BASE_PATH?.replace(/\/$/, "") || "";

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // Permite abrir el servidor de desarrollo desde el proxy del IDE (CloudFront).
  allowedDevOrigins: ["*.cloudfront.net"],
  // El solver HiGHS carga un .wasm desde node_modules: no se empaqueta.
  serverExternalPackages: ["highs", "bcryptjs", "qrcode"],
  poweredByHeader: false,
  // Nunca empaquetar datos locales, CSV crudos ni credenciales en el artefacto desplegable.
  outputFileTracingExcludes: { "*": ["./data/**/*", "./.env*", "./infra/**/*", "./scripts/**/*", "./.kiro/**/*"] },
  // Salida autocontenida para empaquetar en AWS Lambda (Lambda Web Adapter).
  output: "standalone",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Micrófono solo para este origen (necesario para donar por voz).
          { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
