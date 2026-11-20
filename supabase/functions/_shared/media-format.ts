// UZU — Class Media : reconnaissance des formats et des métadonnées sensibles.
// Module pur (aucune API propre à Deno ni au navigateur) : utilisé par la fonction serveur class-media
// pour décider, et par l'application pour préparer les fichiers avant l'envoi.
// Le format est reconnu par les premiers octets du fichier, jamais par son nom ni par le type annoncé.

export type MediaMime = "image/jpeg" | "image/png" | "image/webp" | "video/mp4" | "video/webm" | "video/quicktime"

const ascii = (b: Uint8Array, o: number, n: number) => { let s = ""; for (let i = 0; i < n && o + i < b.length; i++) s += String.fromCharCode(b[o + i]); return s }
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3]

// Marques ISO-BMFF reconnues comme MP4 (la marque « qt  » désigne le format MOV d'Apple)
const MP4_BRANDS = new Set(["isom", "iso2", "iso3", "iso4", "iso5", "iso6", "iso7", "iso8", "iso9", "mp41", "mp42", "mp71", "avc1", "M4V ", "M4VP", "MSNV", "dash", "f4v ", "XAVC", "MiPr"])

/** Type réel d'après les premiers octets (64 octets au moins conseillés), ou null si non accepté. */
export function detectMime(b: Uint8Array): MediaMime | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg"
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png"
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "image/webp"
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    // En-tête EBML : élément DocType (0x42 0x82) suivi de sa taille puis de « webm »
    for (let i = 4; i < Math.min(b.length - 6, 64); i++)
      if (b[i] === 0x42 && b[i + 1] === 0x82) { const n = b[i + 2] & 0x7f; return ascii(b, i + 3, Math.min(n, 8)) === "webm" ? "video/webm" : null }
    return null
  }
  if (b.length >= 12 && ascii(b, 4, 4) === "ftyp") {
    const size = u32(b, 0), major = ascii(b, 8, 4)
    if (major === "qt  ") return "video/quicktime"
    if (MP4_BRANDS.has(major)) return "video/mp4"
    for (let o = 16; o + 4 <= Math.min(size, b.length); o += 4) { const c = ascii(b, o, 4); if (MP4_BRANDS.has(c)) return "video/mp4" }
    return null // HEIC, AVIF, 3GP non pris en charge…
  }
  return null
}
export const kindOfMime = (m: string) => m.startsWith("image/") ? "photo" : "video"

/** Photo contenant encore des métadonnées (EXIF ou XMP, où se trouve la position GPS) */
export function photoHasMetadata(b: Uint8Array, mime: string): boolean {
  if (mime === "image/jpeg") {
    let o = 2
    while (o + 4 <= b.length) {
      if (b[o] !== 0xff) return false
      const m = b[o + 1]
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { o += 2; continue }
      if (m === 0xda || m === 0xd9) return false // début de l'image : plus de métadonnées après
      const len = (b[o + 2] << 8) + b[o + 3]
      if (m === 0xe1) { const id = ascii(b, o + 4, 29); if (id.startsWith("Exif") || id.startsWith("http://ns.adobe.com/xap")) return true }
      o += 2 + len
    }
    return false
  }
  if (mime === "image/png") {
    let o = 8
    while (o + 8 <= b.length) {
      const len = u32(b, o), type = ascii(b, o + 4, 4)
      if (type === "eXIf") return true
      if ((type === "iTXt" || type === "tEXt" || type === "zTXt") && ascii(b, o + 8, 17) === "XML:com.adobe.xmp") return true
      if (type === "IEND") return false
      o += 12 + len
    }
    return false
  }
  if (mime === "image/webp") {
    let o = 12
    while (o + 8 <= b.length) {
      const type = ascii(b, o, 4), len = b[o + 4] + (b[o + 5] << 8) + (b[o + 6] << 16) + (b[o + 7] << 24 >>> 0)
      if (type === "EXIF" || type === "XMP ") return true
      o += 8 + len + (len & 1)
    }
    return false
  }
  return false
}

export type BoxHeader = { type: string; size: number; header: number }
/** En-tête de boîte ISO-BMFF à partir de 16 octets ; size = 0 → jusqu'à la fin (rest) */
export function readBoxHeader(b: Uint8Array, rest: number): BoxHeader | null {
  if (b.length < 8) return null
  let size = u32(b, 0), header = 8
  const type = ascii(b, 4, 4)
  if (size === 1) { if (b.length < 16) return null; size = u32(b, 8) * 4294967296 + u32(b, 12); header = 16 }
  else if (size === 0) size = rest
  if (size < header) return null
  return { type, size, header }
}

// Localisation dans les métadonnées MP4 et MOV : on parcourt l'arbre des boîtes de la boîte moov
// (jamais les données image ni les tables d'échantillons) pour trouver :
//   « ©xyz » et « loci » dans udta ou meta ; la clé Apple « com.apple.quicktime.location.* » de meta/keys
//   et sa valeur dans meta/ilst ; et, par sécurité, une coordonnée écrite en clair dans udta ou meta.
const KEY_LOCATION = "com.apple.quicktime.location"
const COORD = /[+-]\d{1,2}\.\d{3,}[+-]\d{1,3}\.\d{3,}/
const CONTAINERS = new Set(["moov", "trak", "udta", "meta", "ilst", "mdia", "minf", "edts"])
type Found = { kind: "xyz" | "loci" | "keyname" | "value" | "text"; start: number; end: number; boxStart?: number }

function walk(m: Uint8Array, from: number, to: number, depth: number, inMeta: boolean, out: Found[], keys: number[]) {
  let o = from
  for (let n = 0; n < 500 && o + 8 <= to; n++) {
    let size = u32(m, o), header = 8
    const type = ascii(m, o + 4, 4)
    if (size === 1 && o + 16 <= to) { size = u32(m, o + 8) * 4294967296 + u32(m, o + 12); header = 16 }
    else if (size === 0) size = to - o
    if (size < header || o + size > to) return
    const p = o + header, e = o + size
    if (type === "\u00a9xyz") out.push({ kind: "xyz", start: p, end: e, boxStart: o })
    else if (type === "loci" && inMeta) out.push({ kind: "loci", start: p, end: e, boxStart: o })
    else if (type === "keys" && inMeta) {
      // fullbox : version/flags (4) + nombre d'entrées (4) puis [taille (4), espace (4), nom]
      let q = p + 8, idx = 0
      while (q + 8 <= e) { const es = u32(m, q); if (es < 8 || q + es > e) break; idx++
        const name = ascii(m, q + 8, es - 8)
        if (name.startsWith(KEY_LOCATION)) { keys.push(idx); out.push({ kind: "keyname", start: q + 8, end: q + es }) }
        q += es }
    } else if (type === "ilst") {
      // éléments : type = numéro de clé (1, 2, …) ; enfant « data » : type (4) + langue (4) + valeur
      let q = p
      while (q + 8 <= e) { const is = u32(m, q); if (is < 8 || q + is > e) break
        const keyIdx = u32(m, q + 4)
        let d = q + 8
        while (d + 16 <= q + is) { const ds = u32(m, d); if (ds < 16 || d + ds > q + is) break
          if (ascii(m, d + 4, 4) === "data") out.push({ kind: "value", start: d + 16, end: d + ds, boxStart: keyIdx })
          d += ds }
        q += is }
    } else if (CONTAINERS.has(type) && depth < 8) {
      let cp = p
      if (type === "meta" && ascii(m, p + 4, 4) !== "hdlr" && ascii(m, p + 8, 4) === "hdlr") cp = p + 4 // meta ISO : version/flags
      walk(m, cp, e, depth + 1, inMeta || type === "udta" || type === "meta", out, keys)
    }
    if ((type === "udta" || type === "meta") && COORD.test(latin1(m.subarray(p, e)))) out.push({ kind: "text", start: p, end: e })
    o = e
  }
}
const latin1 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + 8192))); return s }
function findings(moov: Uint8Array): Found[] {
  const out: Found[] = [], keys: number[] = []
  walk(moov, 0, moov.length, 0, false, out, keys)
  // ne garder que les valeurs ilst rattachées à une clé de localisation
  return out.filter(f => f.kind !== "value" || keys.includes(f.boxStart as number))
}
const nonZero = (m: Uint8Array, a: number, b: number) => { for (let i = a; i < b; i++) if (m[i] !== 0) return true; return false }

/** La boîte moov (métadonnées), lue seule, contient-elle encore une position ? */
export function moovHasLocation(moov: Uint8Array): boolean {
  return findings(moov).some(f => f.kind === "keyname" || f.kind === "text" || nonZero(moov, f.start, f.end))
}

/** Position d'une boîte de premier niveau dans un fichier entier (navigateur) */
/**
 * Codec vidéo d'un MP4/MOV, lu dans la description des pistes (moov) : HEVC (dont Dolby Vision) ou H.264.
 * Sert seulement à prévenir l'auteur : certaines vidéos HEVC d'iPhone ne se lisent pas sur tous les Android.
 */
export function videoCodec(b: Uint8Array): "hevc" | "h264" | "other" | null {
  const mv = findTopBox(b, "moov"); if (!mv) return null
  const m = b.subarray(mv.start, Math.min(b.length, mv.start + mv.size))
  const has = (t: string) => { const c = [...t].map(x => x.charCodeAt(0)); for (let i = 0; i + 4 <= m.length; i++) if (m[i] === c[0] && m[i + 1] === c[1] && m[i + 2] === c[2] && m[i + 3] === c[3]) return true; return false }
  if (has("hvc1") || has("hev1") || has("dvh1") || has("dvhe")) return "hevc"
  if (has("avc1") || has("avc3")) return "h264"
  return "other"
}

const find4 = (m: Uint8Array, t: string, from = 0) => {
  const c0 = t.charCodeAt(0), c1 = t.charCodeAt(1), c2 = t.charCodeAt(2), c3 = t.charCodeAt(3)
  for (let i = from; i + 4 <= m.length; i++) if (m[i] === c0 && m[i + 1] === c1 && m[i + 2] === c2 && m[i + 3] === c3) return i
  return -1
}
/**
 * Vidéo HDR ou 10 bits (réglage par défaut des iPhone récents) : Dolby Vision, HEVC Main 10 ou profondeur > 8 bits,
 * H.264 High 10, ou courbe de transfert HDR (PQ, HLG) déclarée. Ces vidéos ne se lisent pas sur une partie des
 * téléphones Android (son seul, écran noir) : elles sont refusées à l'envoi (décision du 20/11, option 2).
 * Lecture de la description des pistes (moov) uniquement ; aucune conversion.
 */
export const HDR_MSG = "Vidéo HDR (10 bits) refusée : elle ne se lit pas sur une partie des téléphones Android. Sur l'iPhone, désactive Réglages › Appareil photo › Enregistrement vidéo › « Vidéo HDR », ou choisis Réglages › Appareil photo › Formats › « Le plus compatible », puis filme à nouveau."
export function moovIsHdr10(moov: Uint8Array): boolean {
  for (const t of ["dvh1", "dvhe", "dva1", "dvav"]) if (find4(moov, t) >= 0) return true
  for (let i = find4(moov, "hvcC"); i >= 0; i = find4(moov, "hvcC", i + 4)) {
    const d = i + 4; if (d + 19 > moov.length) break
    if ((moov[d + 1] & 0x1f) === 2 || (moov[d + 17] & 0x07) > 0 || (moov[d + 18] & 0x07) > 0) return true
  }
  for (let i = find4(moov, "avcC"); i >= 0; i = find4(moov, "avcC", i + 4)) { const d = i + 4; if (d + 2 <= moov.length && moov[d + 1] === 110) return true }
  for (let i = find4(moov, "colr"); i >= 0; i = find4(moov, "colr", i + 4)) {
    const d = i + 4; if (d + 8 > moov.length) break
    const k = String.fromCharCode(moov[d], moov[d + 1], moov[d + 2], moov[d + 3])
    if (k === "nclx" || k === "nclc") { const trc = (moov[d + 6] << 8) | moov[d + 7]; if (trc === 16 || trc === 18) return true }
  }
  return false
}
/** Même contrôle sur un fichier entier (côté application, avant l'envoi) */
export function videoIsHdr10(b: Uint8Array): boolean {
  const mv = findTopBox(b, "moov"); return !!mv && moovIsHdr10(b.subarray(mv.start, Math.min(b.length, mv.start + mv.size)))
}

export function findTopBox(b: Uint8Array, type: string): { start: number; size: number; header: number } | null {
  let o = 0
  for (let n = 0; n < 200 && o + 8 <= b.length; n++) {
    const h = readBoxHeader(b.subarray(o, o + 16), b.length - o)
    if (!h) return null
    if (h.type === type) return { start: o, size: h.size, header: h.header }
    o += h.size
  }
  return null
}

/**
 * Neutralise la localisation d'une vidéo MP4 ou MOV, sur place, sans conversion ni changement de taille :
 * « ©xyz » et « loci » deviennent des boîtes « free » vidées, la clé Apple de localisation est masquée,
 * sa valeur effacée, et une coordonnée écrite en clair dans udta ou meta est remplacée par des zéros.
 * Renvoie le nombre de corrections.
 */
export function neutralizeLocation(file: Uint8Array): number {
  const top = findTopBox(file, "moov")
  if (!top) return 0
  const m = file.subarray(top.start, top.start + top.size)
  let n = 0
  for (const f of findings(m)) {
    if ((f.kind === "xyz" || f.kind === "loci") && f.boxStart !== undefined) {
      m[f.boxStart + 4] = 0x66; m[f.boxStart + 5] = 0x72; m[f.boxStart + 6] = 0x65; m[f.boxStart + 7] = 0x65 // « free »
      m.fill(0, f.start, f.end); n++
    } else if (f.kind === "keyname") { m.fill(0x78, f.start, f.end); n++ }
    else if (f.kind === "value") { m.fill(0, f.start, f.end); n++ }
    else if (f.kind === "text") {
      const txt = latin1(m.subarray(f.start, f.end)), re = new RegExp(COORD.source, "g")
      for (let r = re.exec(txt); r; r = re.exec(txt)) { m.fill(0x30, f.start + r.index, f.start + r.index + r[0].length); n++ }
    }
  }
  return n
}

export type ByteRange = { start: number; end: number }
/** Lecture « Range » : bytes=a-b, bytes=a-, bytes=-n ; plafonnée à `chunk` octets. null = demande invalide. */
export function parseRange(h: string | null, size: number, chunk: number): ByteRange | null {
  if (size <= 0) return null
  if (!h) return { start: 0, end: Math.min(size, chunk) - 1 }
  const m = /^bytes=(\d*)-(\d*)$/.exec(h.trim())
  if (!m || (m[1] === "" && m[2] === "")) return null
  let start: number, end: number
  if (m[1] === "") { const n = Number(m[2]); if (!n) return null; start = Math.max(0, size - n); end = size - 1 }
  else { start = Number(m[1]); end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1) }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= size || end < start) return null
  return { start, end: Math.min(end, start + chunk - 1) }
}
