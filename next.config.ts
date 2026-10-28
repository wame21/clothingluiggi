import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // GitHub Pages solo sirve archivos: sitio estático bajo /<repo>; la sesión va del navegador a Supabase
  output: "export",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  trailingSlash: true,
  // Oculta el indicador de desarrollo para presentar la demo limpia
  devIndicators: false,
};

export default nextConfig;
