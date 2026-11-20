// Class Media : le navigateur confie ici le jeton de lecture d'une vidéo (voir lib/uzu/cm-proxy.ts)
import { storeTicket } from "@/lib/uzu/cm-proxy"

export const dynamic = "force-dynamic"
export const POST = (req: Request) => storeTicket(req)
