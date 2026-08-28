// publish: the shots leave the machine.
// stdout is the markdown block and NOTHING else; saatchi talks on stderr.
import { readdir, stat, unlink } from "node:fs/promises"
import { join } from "node:path"
import { MIME, field, httpStory, isWebm, markdown, mimeFor, type Landed } from "./upload.ts"

const say = (line: string) => console.error(`saatchi: ${line}`)
const fail = (line: string) => console.error(`saatchi: FAIL ${line}`)

function indent(block: string): string {
  return block
    .trimEnd()
    .split("\n")
    .map((l) => `  ${l}`)
    .join("\n")
}

const sizeOf = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} kB`

async function sh(cmd: string[]): Promise<{ code: number; out: string; err: string }> {
  const proc = Bun.spawn(cmd, { stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { code, out, err }
}

async function main(): Promise<number> {
  const t0 = Date.now()
  const secs = () => ((Date.now() - t0) / 1000).toFixed(1)
  const shotsDir = join(process.cwd(), ".saatchi", "shots")

  // — the shots —
  let names: string[]
  try {
    names = (await readdir(shotsDir, { withFileTypes: true }))
      .filter((d) => d.isFile() && !d.name.startsWith("."))
      .map((d) => d.name)
      .sort()
  } catch {
    fail("— no .saatchi/shots/ here; photograph first")
    return 1
  }
  if (names.length === 0) {
    fail("— no shots in .saatchi/shots/; photograph first")
    return 1
  }

  // — webm → mp4, in place; ffmpeg's own words on failure (v1's video lesson) —
  const lost: { file: string; why: string }[] = []
  const files = new Set<string>()
  for (const name of names) {
    if (!isWebm(name)) {
      files.add(name)
      continue
    }
    const mp4 = name.replace(/\.webm$/i, ".mp4")
    const r = await sh([
      "ffmpeg", "-y",
      "-i", join(shotsDir, name),
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      join(shotsDir, mp4),
    ])
    if (r.code !== 0) {
      fail(`→ ${name}: ffmpeg said ↓\n${indent(r.err)}`)
      lost.push({ file: name, why: `ffmpeg exited ${r.code}` })
      continue
    }
    await unlink(join(shotsDir, name)).catch(() => {})
    say(`webm → ${mp4}`)
    files.add(mp4)
  }
  const queue = [...files].sort()

  // — the repo and the token: gh, run from the consumer's worktree, no flags —
  // (`gh repo view --json id` is a GraphQL NODE id; the endpoint 404s on it.
  //  `gh api repos/{owner}/{repo}` — same no-flags convention — has the numeric one.)
  const repo = await sh(["gh", "api", "repos/{owner}/{repo}"])
  if (repo.code !== 0) {
    fail(`— gh could not see a repository from this worktree ↓\n${indent(repo.err)}`)
    return 1
  }
  const repoId = field(repo.out, "id")
  if (!repoId) {
    fail(`— gh api repos/{owner}/{repo}: no .id in the response`)
    return 1
  }
  const auth = await sh(["gh", "auth", "token"])
  const token = auth.out.trim()
  if (auth.code !== 0 || !token) {
    fail("— no token from `gh auth token`; run `gh auth login` first")
    return 1
  }

  // — the upload: one POST per shot (the settled curl line), in name order —
  const landed: Landed[] = []
  for (const file of queue) {
    const path = join(shotsDir, file)
    const mime = mimeFor(file)
    if (!mime) {
      fail(`→ ${file}: unsupported type (I know: ${Object.keys(MIME).join(" ")})`)
      lost.push({ file, why: "unsupported type" })
      continue
    }
    const qs = new URLSearchParams({ name: file, content_type: mime, repository_id: repoId })
    const t1 = Date.now()
    const r = await sh([
      "curl", "-sS",
      `https://uploads.github.com/user-attachments/assets?${qs}`,
      "-X", "POST",
      "-H", `Authorization: Bearer ${token}`,
      "-H", "Accept: application/json",
      "--data-binary", `@${path}`,
      "-w", "\n%{http_code}",
    ])
    if (r.code !== 0) {
      fail(`→ ${file}: curl: ${r.err.trim() || `exit ${r.code}`}`)
      lost.push({ file, why: "curl failed" })
      continue
    }
    const cut = r.out.lastIndexOf("\n")
    const code = Number(r.out.slice(cut + 1))
    const body = cut < 0 ? "" : r.out.slice(0, cut)
    if (!Number.isFinite(code)) {
      fail(`→ ${file}: unparseable curl output`)
      lost.push({ file, why: "unparseable curl output" })
      continue
    }
    if (code >= 200 && code < 300) {
      const url = field(body, "url")
      if (!url) {
        fail(`→ ${file}: HTTP ${code} but no .url in the response ↓\n${indent(body.slice(0, 400))}`)
        lost.push({ file, why: `HTTP ${code}, no .url` })
        continue
      }
      landed.push({ file, url })
      const n = await stat(path).then((s) => s.size).catch(() => 0)
      say(`up   → ${file} (${sizeOf(n)}, ${((Date.now() - t1) / 1000).toFixed(1)}s)`)
      continue
    }
    const story = httpStory(code, body)
    fail(`→ ${file}: ${story}`)
    lost.push({ file, why: story })
  }

  // — stdout: the markdown block; stderr: the account of it —
  if (landed.length > 0) {
    process.stdout.write(`${markdown(landed)}\n`)
  }
  if (lost.length > 0) {
    fail(`— ${lost.length} of ${lost.length + landed.length} did not land:`)
    for (const { file, why } of lost) {
      console.error(`  ${file} — ${why}`)
    }
    if (landed.length > 0) {
      say(`the ${landed.length} that landed are in the markdown on stdout`)
    }
    return 1
  }
  say(`up (${landed.length} shots, ${secs()}s) — markdown on stdout`)
  return 0
}

if (import.meta.main) {
  process.exit(await main())
}
