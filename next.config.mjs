/** @type {import('next').NextConfig} */
const nextConfig = {
  // Les erreurs TypeScript bloquent la mise en ligne (audit, incompatibilité n° 6).
  typescript: { ignoreBuildErrors: false },
  images: { unoptimized: true },
  skipTrailingSlashRedirect: true,
  // L'ancienne application (/legacy/) est retirée : ses adresses renvoient vers l'application.
  // Seul /legacy/sw.js reste servi, pour que les téléphones abonnés aux notifications depuis
  // l'ancienne application continuent de les recevoir (elles ouvrent désormais l'application).
  async redirects() {
    return [
      { source: "/legacy", destination: "/", permanent: false },
      { source: "/legacy/", destination: "/", permanent: false },
      { source: "/legacy/index.html", destination: "/", permanent: false },
      { source: "/legacy/manifest.webmanifest", destination: "/manifest.webmanifest", permanent: false },
    ]
  },
}

export default nextConfig
