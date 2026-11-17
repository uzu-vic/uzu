import type { Metadata, Viewport } from "next"
import "./globals.css"
import "./uzu.css"
import { Audience } from "@/components/uzu/audience"

export const metadata: Metadata = {
  title: "UZU — The mat doesn't lie",
  description: "Progresser, transmettre et faire grandir votre académie de sports de combat.",
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "UZU", statusBarStyle: "default" },
}

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f5f2ed",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}<Audience /></body>
    </html>
  )
}
