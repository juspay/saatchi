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

export function isVideo(name: string): boolean {
  return (mimeFor(name) ?? "").startsWith("video/")
}

/** before-dismiss.png → before-dismiss (the markdown alt text). */
export function stem(name: string): string {
  const e = ext(name)
  return e ? name.slice(0, -(e.length + 1)) : name
}

export type Landed = { file: string; url: string }

/**
 * The ONE markdown block on stdout, ready to paste into a PR body:
 * images embed; a video is a bare URL on its own line
 * (GitHub renders a player; image syntax does not).
 */
export function markdown(landed: Landed[]): string {
  return landed
    .map(({ file, url }) => (isVideo(file) ? url : `![${stem(file)}](${url})`))
    .join("\n\n")
}

/** The endpoint's failure classes, each with its story. */
export function httpStory(code: number, body: string): string {
  if (code === 401 || code === 403) {
    return `uploads.github.com rejected the token (HTTP ${code}) — run \`gh auth login\`; the token needs repo access`
  }
  if (code === 404) {
    return `no repository with this id, or no push rights on it (HTTP 404) — \`gh repo view\` in this worktree decides the target`
  }
  if (code === 422) {
    return `unsupported type (HTTP 422)`
  }
  const clip = body.replace(/\s+/g, " ").trim().slice(0, 200)
  return `HTTP ${code}${clip ? ` — ${clip}` : ""}`
}
