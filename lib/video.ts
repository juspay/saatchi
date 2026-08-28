import type { Browser, BrowserContext, Page } from "playwright-core"

// Section opt-in is `export const record = true` on evidence.ts (mp4, not stills).

export type Captured = {
  page: Page
  finalize: () => Promise<void>
}

export async function openCaptured(
  browser: Browser,
  opts: { record: boolean; shotsDir: string },
): Promise<Captured> {
  const context: BrowserContext = await browser.newContext(
    opts.record
      ? { recordVideo: { dir: opts.shotsDir, size: { width: 1280, height: 720 } } }
      : {},
  )
  const page = await context.newPage()
  return {
    page,
    finalize: async () => {
      const video = opts.record ? page.video() : null
      await page.close()
      await context.close()
      if (!video) return
      const webm = await video.path()
      const mp4 = `${opts.shotsDir}/record.mp4`
      const proc = Bun.spawn(
        [
          "ffmpeg",
          "-y",
          "-i",
          webm,
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          mp4,
        ],
        { stdout: "ignore", stderr: "pipe" },
      )
      const errText = proc.stderr ? await new Response(proc.stderr).text() : ""
      const code = await proc.exited
      if (code !== 0) {
        throw new Error(errText.trim() || `ffmpeg exited ${code}`)
      }
      try {
        await Bun.file(webm).unlink()
      } catch {
        // leave the webm if unlink fails
      }
    },
  }
}
