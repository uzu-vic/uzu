/** @type {import('next').NextConfig} */
const nextConfig = {
  // Les erreurs TypeScript bloquent la mise en ligne (audit, incompatibilité n° 6).
  typescript: { ignoreBuildErrors: false },
  images: { unoptimized: true },
  // L'ancienne application est servie sur /legacy/ pendant la fusion. Ses chemins relatifs
  // (sw.js, manifeste, icônes) sont rattachés à /legacy/ par une balise <base> ajoutée au build.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      { source: "/legacy", destination: "/legacy/index.html" },
      { source: "/legacy/", destination: "/legacy/index.html" },
    ]
  },
}

export default nextConfig
