// publish's pure parts. No io — every branch here is CI territory
// (`bun test upload.test.ts`, run by `nix flake check`).

export const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  pdf: "application/pdf",
}

export function ext(name: string): string {
  const dot = name.lastIndexOf(".")
  if (dot <= 0 || dot === name.length - 1) return ""
  return name.slice(dot + 1).toLowerCase()
}

export function mimeFor(name: string): string | null {
  return MIME[ext(name)] ?? null
}

/** playwright records webm; GitHub's player wants mp4. */
export function isWebm(name: string): boolean {
  return ext(name) === "webm"
}

/**
 * Every name in `files` the transcode target could clobber: exact, and
 * case-folded — a case-insensitive filesystem hands `ffmpeg -y clip.mp4`
 * the inode of `Clip.mp4` while reporting both as distinct to readdir.
 * (Refusing case-folded pairs on a case-sensitive fs is deliberate:
 * uniform behavior, and a case-only twin in one directory confuses humans.)
 */
export function siblingsOf(files: ReadonlySet<string>, target: string): string[] {
  const folded = target.toLowerCase()
  return [...files].filter((f) => f.toLowerCase() === folded)
}

/** before-dismiss.png → before-dismiss (the markdown alt text). */
export function stem(name: string): string {
  const e = ext(name)
  return e ? name.slice(0, -(e.length + 1)) : name
}

export type Landed = { file: string; url: string }

/** 0 B is real information — a floored "1 kB" hides exactly the dead artifact. */
export function sizeOf(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} kB`
  return `${n} B`
}

/** {"id":42} → "42" — the field, or null when it isn't there or isn't json. */
export function field(json: string, key: string): string | null {
  try {
    const v = (JSON.parse(json) as Record<string, unknown>)[key]
    return v == null ? null : String(v)
  } catch {
    return null
  }
}

/** `[`, `]`, the escape char itself: any of them in the alt breaks the image syntax. */
function alt(name: string): string {
  return stem(name).replace(/([\\\[\]])/g, "\\$1")
}

/**
 * The ONE markdown block on stdout, ready to paste into a PR body:
 * images embed; everything else is a bare URL on its own line —
 * GitHub renders a player for a video URL, while image syntax on a video
 * renders a player-shaped nothing, and on a pdf, a broken image icon.
 */
export function markdown(landed: Landed[]): string {
  return landed
    .map(({ file, url }) => ((mimeFor(file) ?? "").startsWith("image/") ? `![${alt(file)}](${url})` : url))
    .join("\n\n")
}

/** The endpoint's failure classes, each with its story. */
export function httpStory(code: number, body: string): string {
  if (code === 401 || code === 403) {
    return `uploads.github.com rejected the token (HTTP ${code}) — run \`gh auth login\`; the token needs repo access`
  }
  if (code === 404) {
    return `no repository with this id, or no push rights on it (HTTP 404) — the id came from \`gh api repos/{owner}/{repo}\`; \`gh repo view --json id\` returns a graph node id and 404s here`
  }
  if (code === 422) {
    return `usually an unsupported type — GitHub also 422s on size/validation refusals (HTTP 422)`
  }
  const clip = body.replace(/\s+/g, " ").trim().slice(0, 200)
  return `HTTP ${code}${clip ? ` — ${clip}` : ""}`
}
