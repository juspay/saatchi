import { chromium, type Browser, type Page } from "playwright-core"
import { pathToFileURL } from "node:url"
import { openCaptured, type Captured } from "./video.ts"

export type Saatchi = {
  page: Page
  shot: (name: string) => Promise<void>
}

function appAlive(): boolean {
  const pid = Number(process.env.SAATCHI_APP_PID)
  if (!pid) return true
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** 30s slice, extended while the app process is still alive. */
const READY_SLICE_MS = 30_000

async function waitReady(origin: string) {
  let deadline = Date.now() + READY_SLICE_MS
  while (true) {
    if (!appAlive()) {
      throw Object.assign(new Error(`app did not answer 200 on ${origin}`), { saatchi: 2 })
    }
    try {
      const r = await fetch(origin, { redirect: "manual" })
      if (r.status === 200) return
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) {
      if (appAlive()) deadline = Date.now() + READY_SLICE_MS
      else {
        throw Object.assign(new Error(`app did not answer 200 on ${origin}`), { saatchi: 2 })
      }
    }
    await Bun.sleep(100)
  }
}

function shotNamesFrom(source: string): string[] {
  return [...source.matchAll(/\bshot\(\s*["'`]([^"'`]+)["'`]\s*\)/g)].map((m) => m[1]!)
}

/** Playwright writes this to stderr when PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS is set. */
function muteHostRequirementsChatter() {
  const raw = process.stderr.write.bind(process.stderr)
  process.stderr.write = ((
    chunk: string | Uint8Array,
    encoding?: BufferEncoding | ((err?: Error | null) => void),
    cb?: (err?: Error | null) => void,
  ) => {
    const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString()
    if (text.includes("Skipping host requirements validation")) {
      if (typeof encoding === "function") encoding()
      else if (cb) cb()
      return true
    }
    return raw(chunk, encoding as never, cb)
  }) as typeof process.stderr.write
}

function say(line: string) {
  console.log(line)
}

function fail(line: string) {
  console.error(line)
}

function failLine(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { name?: string; message?: string }
    const message = (e.message ?? String(err)).split("\n")[0] ?? String(err)
    if (e.name && e.name !== "Error" && !message.startsWith(e.name)) {
      return `${e.name}: ${message}`
    }
    return message
  }
  return String(err)
}

function bootFailed(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { saatchi?: number }).saatchi === 2)
}

async function main() {
  muteHostRequirementsChatter()
  const port = process.env.PORT
  if (!port) {
    fail("saatchi: FAIL — PORT is not set")
    process.exit(2)
  }
  const origin = `http://127.0.0.1:${port}`
  const evidencePath = process.env.SAATCHI_EVIDENCE
  const shotsDir = process.env.SAATCHI_SHOTS
  if (!evidencePath || !shotsDir) {
    fail("saatchi: FAIL — SAATCHI_EVIDENCE / SAATCHI_SHOTS are not set")
    process.exit(2)
  }
  const startMs = Number(process.env.SAATCHI_START_MS || Date.now())

  let browser: Browser | undefined
  let captured: Captured | undefined
  let failed = false
  let record = false
  let exitCode = 0

  try {
    await waitReady(origin)
    const up = ((Date.now() - startMs) / 1000).toFixed(1)
    say(`saatchi: app  → up ${up}s, ready`)

    const sectionMod = await import(pathToFileURL(evidencePath).href)
    const section = sectionMod.default
    if (typeof section !== "function") {
      throw new Error("evidence.ts must default-export an async function")
    }
    record = sectionMod.record === true
    const names = shotNamesFrom(await Bun.file(evidencePath).text())
    const taken: string[] = []

    const executablePath = process.env.PLAYWRIGHT_LAUNCH_OPTIONS_EXECUTABLE_PATH || undefined
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    })
    captured = await openCaptured(browser, { record, shotsDir })

    try {
      await captured.page.goto(origin, { waitUntil: "load" })
      const shot = async (name: string) => {
        taken.push(name)
        if (record) {
          say(`saatchi: shot → ${name}`)
          return
        }
        const rel = `.saatchi/shots/${name}.png`
        await captured!.page.screenshot({ path: `${shotsDir}/${name}.png`, fullPage: true })
        say(`saatchi: shot → ${rel}`)
      }
      await section({ page: captured.page, shot } satisfies Saatchi)
    } catch (e) {
      failed = true
      const next = names[taken.length] ?? taken.at(-1) ?? "before first shot"
      fail(`saatchi: FAIL at shot "${next}" — ${failLine(e)}`)
    }
  } catch (e) {
    fail(`saatchi: FAIL — ${failLine(e)}`)
    exitCode = bootFailed(e) ? 2 : 1
  } finally {
    if (captured) {
      try {
        await captured.finalize()
      } catch (e) {
        failed = true
        fail(`saatchi: FAIL — ${failLine(e)}`)
      }
    }
    if (browser) {
      try {
        await browser.close()
      } catch {
        // already going down
      }
    }
  }

  if (exitCode === 0 && !failed && record) {
    say(`saatchi: shot → .saatchi/shots/record.mp4`)
  }
  if (failed) exitCode = 1
  if (exitCode) process.exit(exitCode)
}

if (import.meta.main) {
  await main()
}
