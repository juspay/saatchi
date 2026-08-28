const port = Number(process.env.PORT)
const data = process.env.DATA!

const items = (await Array.fromAsync(new Bun.Glob("*").scan(data))).sort()

// the clock exists so a record=true run has visible motion to show
const clock = `<footer id="clock">0.0s</footer><script>const t0=Date.now();setInterval(()=>{document.getElementById("clock").textContent=((Date.now()-t0)/1000).toFixed(1)+"s"},100)</script>`

const html = (body: string) =>
  new Response(`<!doctype html><html><body>${body}${clock}</body></html>`, {
    headers: { "content-type": "text/html; charset=utf-8" },
  })

Bun.serve({
  port,
  async fetch(req) {
    const { pathname } = new URL(req.url)
    if (pathname === "/") {
      const lis = items.map((n) => `<li><a href="/i/${n}">${n}</a></li>`).join("")
      return html(`<h1>items</h1><ul>${lis}</ul>`)
    }
    const m = pathname.match(/^\/i\/([^/]+)$/)
    if (m && items.includes(m[1]!)) {
      const body = await Bun.file(`${data}/${m[1]}`).text()
      return html(`<h1>${m[1]}</h1><pre>${body}</pre><a href="/">back</a>`)
    }
    return new Response("no", { status: 404 })
  },
})
