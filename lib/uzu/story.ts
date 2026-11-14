"use client"
// Image « Story » d'une séance (1080 × 1920), même composition que l'ancienne application.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any
const durTxt = (m: number) => { const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? " " + String(r).padStart(2, "0") : ""}` : `${r} min` }

export function storyCanvas(C: Any, item: Any, sessions: Any[]): HTMLCanvasElement {
  const streak = C.streakDays(sessions.filter((s: Any) => !s.sample), item.date)
  const c = document.createElement("canvas"), W = 1080, H = 1920
  c.width = W; c.height = H
  const x = c.getContext("2d")!
  const red = "#E8283F", disp = 'Georgia, "Times New Roman", serif', body = 'system-ui, -apple-system, "Segoe UI", sans-serif'
  x.fillStyle = "#111113"; x.fillRect(0, 0, W, H)
  const spiral = (cx: number, cy: number, n: number, r0: number, k: number, lw: number, col: string) => {
    x.strokeStyle = col; x.lineWidth = lw; x.lineCap = "round"; x.beginPath()
    for (let i = 0; i <= n; i++) { const t = i / n * Math.PI * 5.2, r = r0 + t * k, px = cx + r * Math.cos(t - Math.PI / 2), py = cy + r * Math.sin(t - Math.PI / 2); if (i) x.lineTo(px, py); else x.moveTo(px, py) }
    x.stroke()
  }
  spiral(W / 2, 1060, 220, 20, 44, 26, "rgba(232,40,63,.13)")
  spiral(W / 2, 300, 160, 4, 4.4, 11, red)
  const pp = C.isPrepa(item)
  x.textAlign = "center"; x.fillStyle = "#FFFFFF"; x.font = "800 54px " + body; x.fillText("U Z U", W / 2, 450)
  x.fillStyle = "#9AA0A7"; x.font = "700 30px " + body; x.fillText(C.parse(item.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }).toUpperCase(), W / 2, 640)
  x.fillStyle = "#FFFFFF"; x.font = "700 230px " + disp; x.fillText(durTxt(+item.dur || 0).toUpperCase(), W / 2, 920)
  x.font = "700 30px " + body; x.fillStyle = "#9AA0A7"; x.fillText(pp ? "D'EFFORT" : "DE TAPIS", W / 2, 990)
  x.fillStyle = "#FFFFFF"; x.font = "700 64px " + disp
  x.fillText(pp ? "Prépa physique" : item.sys && C.SYSTEMS[item.sys] ? C.SYSTEMS[item.sys].n : (item.type === "No-gi" ? "Grappling no-gi" : "Jiu-jitsu"), W / 2, 1180)
  x.fillStyle = "#9AA0A7"; x.font = "600 40px " + body
  x.fillText(pp ? C.effortName(item) : (item.type || "Gi") + " · " + (C.KINDS[C.kindOf(item)] || C.KINDS.cours).n, W / 2, 1250)
  x.fillStyle = red; x.beginPath()
  const rr = (x as Any).roundRect; if (rr) (x as Any).roundRect(W / 2 - 300, 1360, 600, 130, 65); else x.rect(W / 2 - 300, 1360, 600, 130)
  x.fill()
  x.fillStyle = "#FFFFFF"; x.font = "800 52px " + body; x.fillText(streak > 1 ? "SÉRIE : " + streak + " JOURS" : "SÉRIE : 1 JOUR", W / 2, 1446)
  x.fillStyle = "#FFFFFF"; x.font = "800 34px " + body; x.fillText("THE MAT DOESN'T LIE", W / 2, 1760)
  x.fillStyle = red; x.fillRect(W / 2 - 60, 1690, 120, 6)
  return c
}
