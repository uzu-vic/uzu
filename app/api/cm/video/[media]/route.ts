// Class Media : lecture vidéo relayée par le site, sans jeton dans l'adresse (voir lib/uzu/cm-proxy.ts)
import { relayVideo } from "@/lib/uzu/cm-proxy"
import { SUPABASE_URL } from "@/lib/uzu/env"

export const dynamic = "force-dynamic"
type Ctx = { params: Promise<{ media: string }> }
export const GET = async (req: Request, ctx: Ctx) => relayVideo(req, (await ctx.params).media, SUPABASE_URL)
export const HEAD = async (req: Request, ctx: Ctx) => relayVideo(req, (await ctx.params).media, SUPABASE_URL)
