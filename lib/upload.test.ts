import { describe, expect, test } from "bun:test"
import { MIME, ext, field, httpStory, isWebm, markdown, mimeFor, sizeOf, stem } from "./upload.ts"

describe("the mime table", () => {
  test("shots speak their types", () => {
    expect(mimeFor("before-dismiss.png")).toBe("image/png")
    expect(mimeFor("record.mp4")).toBe("video/mp4")
    expect(mimeFor("clip.webm")).toBe("video/webm")
    expect(mimeFor("photo.JPEG")).toBe("image/jpeg")
    expect(mimeFor("anim.gif")).toBe("image/gif")
    expect(mimeFor("notes.pdf")).toBe("application/pdf")
  })

  test("unknown is null — refused locally, before GitHub sees it", () => {
    expect(mimeFor("cursed.svg")).toBeNull()
    expect(mimeFor("notes.txt")).toBeNull()
    expect(mimeFor("no-extension")).toBeNull()
    expect(mimeFor("trailingdot.")).toBeNull()
    expect(mimeFor(".dotfile")).toBeNull()
  })

})

describe("webm detection", () => {
  test("only webm transcodes — case-insensitively", () => {
    expect(isWebm("take.webm")).toBe(true)
    expect(isWebm("TAKE.WEBM")).toBe(true)
    expect(isWebm("take.mp4")).toBe(false)
    expect(isWebm("webm-as-png.png")).toBe(false)
  })
})

describe("stem", () => {
  test("strips the known extension, keeps the rest", () => {
    expect(stem("before-dismiss.png")).toBe("before-dismiss")
    expect(stem("a.PNG")).toBe("a")
    expect(stem("noext")).toBe("noext")
  })
})

describe("markdown shaping", () => {
  const landed = [
    { file: "before.png", url: "https://u/1" },
    { file: "record.mp4", url: "https://u/2" },
    { file: "after.png", url: "https://u/3" },
  ]

  test("an image embeds with the stem as alt", () => {
    expect(markdown([landed[0]!])).toBe("![before](https://u/1)")
  })

  test("a video is the bare URL — image syntax renders no player", () => {
    expect(markdown([landed[1]!])).toBe("https://u/2")
  })

  test("a pdf is bare too — image syntax renders a broken image icon", () => {
    expect(markdown([{ file: "notes.pdf", url: "https://u/4" }])).toBe("https://u/4")
  })

  test("brackets in a filename can't break the image syntax", () => {
    expect(markdown([{ file: "we[ird]name.png", url: "https://u/5" }])).toBe(
      "![we\\[ird\\]name](https://u/5)",
    )
    expect(markdown([{ file: "a\\b.png", url: "https://u/6" }])).toBe("![a\\\\b](https://u/6)")
  })

  test("order kept; blank line between; no trailing newline", () => {
    expect(markdown(landed)).toBe("![before](https://u/1)\n\nhttps://u/2\n\n![after](https://u/3)")
  })

  test("nothing landed → nothing on stdout", () => {
    expect(markdown([])).toBe("")
  })
})

describe("http stories", () => {
  test("401/403 is the auth story", () => {
    expect(httpStory(401, "")).toContain("gh auth login")
    expect(httpStory(403, "")).toContain("HTTP 403")
  })

  test("404 is the repo/push-rights story — and can't send you to the node id", () => {
    expect(httpStory(404, "")).toMatch(/push rights/)
    expect(httpStory(404, "")).toContain("gh api repos/{owner}/{repo}")
  })

  test("422 is the unsupported-type (or size) refusal", () => {
    expect(httpStory(422, "")).toContain("unsupported type")
    expect(httpStory(422, "")).toMatch(/size/)
  })

  test("anything else keeps the body's first words", () => {
    expect(httpStory(500, '{"message":"boom"}')).toBe('HTTP 500 — {"message":"boom"}')
    expect(httpStory(500, "")).toBe("HTTP 500")
  })
})

describe("sizeOf", () => {
  test("honest at the bottom — a 0 B artifact reads as 0 B", () => {
    expect(sizeOf(0)).toBe("0 B")
    expect(sizeOf(250)).toBe("250 B")
    expect(sizeOf(1023)).toBe("1023 B")
  })

  test("kB and MB above", () => {
    expect(sizeOf(1024)).toBe("1 kB")
    expect(sizeOf(1536)).toBe("2 kB")
    expect(sizeOf(1024 * 1024)).toBe("1.0 MB")
    expect(sizeOf(2.5 * 1024 * 1024)).toBe("2.5 MB")
  })
})

describe("json field", () => {
  test("the field, or null", () => {
    expect(field('{"id":1349937941}', "id")).toBe("1349937941")
    expect(field('{"url":"https://u/1"}', "url")).toBe("https://u/1")
    expect(field('{"other":1}', "url")).toBeNull()
    expect(field("not json", "url")).toBeNull()
    expect(field("{}", "id")).toBeNull()
  })
})

describe("ext", () => {
  test("edge cases", () => {
    expect(ext("a.png")).toBe("png")
    expect(ext("archive.tar.gz")).toBe("gz")
    expect(ext(".hidden")).toBe("")
    expect(ext("noext")).toBe("")
    expect(ext("dot.")).toBe("")
  })
})
