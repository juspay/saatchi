import { chromium, type Page } from "playwright-core"
import { pathToFileURL } from "node:url"
import { openCaptured } from "./video.ts"

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

async function waitReady(origin: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!appAlive()) {
      throw Object.assign(new Error(`app did not answer 200 on ${origin}`), { saatchi: 2 })
    }
    try {
      const r = await fetch(origin, { redirect: "manual" })
      if (r.status === 200) return
    } catch {
      // not listening yet
    }
    await Bun.sleep(100)
  }
  throw Object.assign(new Error(`app did not answer 200 on ${origin}`), { saatchi: 2 })
}

function shotNamesFrom(source: string): string[] {
  return [...source.matchAll(/shot\(\s*["'`]([^"'`]+)["'`]\s*\)/g)].map((m) => m[1]!)
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

async function main() {
  const port = process.env.PORT
  if (!port) {
    console.error("saatchi: FAIL — PORT is not set")
    process.exit(2)
  }
  const origin = `http://127.0.0.1:${port}`
  const evidencePath = process.env.SAATCHI_EVIDENCE
  const shotsDir = process.env.SAATCHI_SHOTS
  if (!evidencePath || !shotsDir) {
    console.error("saatchi: FAIL — SAATCHI_EVIDENCE / SAATCHI_SHOTS are not set")
    process.exit(2)
  }
  const startMs = Number(process.env.SAATCHI_START_MS || Date.now())

  try {
    await waitReady(origin, 30_000)
  } catch (e) {
    console.error(`saatchi: FAIL — ${failLine(e)}`)
    process.exit(2)
  }

  const up = ((Date.now() - startMs) / 1000).toFixed(1)
  console.log(`saatchi: app  → up ${up}s, ready`)

  const sectionMod = await import(pathToFileURL(evidencePath).href)
  const section = sectionMod.default
  if (typeof section !== "function") {
    console.error("saatchi: FAIL — evidence.ts must default-export an async function")
    process.exit(1)
  }
  const record: boolean = sectionMod.record === true
  const names = shotNamesFrom(await Bun.file(evidencePath).text())
  const taken: string[] = []

  const executablePath = process.env.PLAYWRIGHT_LAUNCH_OPTIONS_EXECUTABLE_PATH || undefined
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  })
  const captured = await openCaptured(browser, { record, shotsDir })
  let failed = false

  try {
    await captured.page.goto(origin, { waitUntil: "load" })
    const shot = async (name: string) => {
      taken.push(name)
      if (record) {
        console.log(`saatchi: shot → ${name}`)
        return
      }
      const rel = `.saatchi/shots/${name}.png`
      await captured.page.screenshot({ path: `${shotsDir}/${name}.png`, fullPage: true })
      console.log(`saatchi: shot → ${rel}`)
    }
    await section({ page: captured.page, shot } satisfies Saatchi)
  } catch (e) {
    failed = true
    const next = names[taken.length] ?? taken.at(-1) ?? "before first shot"
    console.error(`saatchi: FAIL at shot "${next}" — ${failLine(e)}`)
  } finally {
    await captured.finalize()
    await browser.close()
  }

  if (!failed && record) {
    console.log(`saatchi: shot → .saatchi/shots/record.mp4`)
  }
  if (failed) process.exit(1)
}

if (import.meta.main) {
  await main()
}
