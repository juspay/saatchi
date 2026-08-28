# saatchi — photograph an app doing the thing

*(Tamil சாட்சி: witness, evidence. github.com/juspay/saatchi.)*

    nix run github:juspay/saatchi            # photograph → .saatchi/shots/
    nix run github:juspay/saatchi#publish    # shots → GitHub, markdown to paste

Reads .saatchi/evidence.ts (your section: a small playwright script — click
this, type that), starts the app via your `just` recipe, runs the section in
a headless browser, writes one screenshot per named step into
.saatchi/shots/, tears everything down. No flags, no arguments, ever.

saatchi knows no app: the app is whatever the `serve` recipe starts, and the
environment is the whole contract between them.

## The consumer's directory

    .saatchi/
    ├── mod.just        tracked    the adapter: a `serve` recipe (env: PORT, HOME, DATA)
    ├── fixtures/       tracked    default data when data/ is absent
    ├── .gitignore      tracked    scaffolded: everything below this line
    ├── evidence.ts     throwaway  the current section
    ├── home/           throwaway  the app's HOME; seed by writing into it
    ├── data/           throwaway  what the app serves, when present
    ├── app.log         throwaway  the app's stdout+stderr, captured by saatchi
    └── shots/          throwaway  one png per shot() call; #publish uploads this dir

    ready  = the app's port answers 200 (30s, extended while the app lives)
    fresh  = git clean -fx .saatchi/
    video  = `export const record = true` in the section (mp4 instead of stills)

`example/` in the saatchi repo is a complete consumer, not a sketch — read
it when in doubt.

## .saatchi/mod.just — the adapter, whole

A justfile module; saatchi runs its `serve` recipe in the foreground and owns
the process, its output, its death. It can also be run by hand for debugging:
`PORT=7788 DATA=.saatchi/fixtures just -f .saatchi/mod.just serve`.

    # env from saatchi: PORT (bind), HOME (already .saatchi/home), DATA (serve this)
    serve:
        #!/usr/bin/env bash
        set -euo pipefail
        cd {{justfile_directory()}}/..
        just build-client
        exec bun run olai web --port "$PORT" --dir "$DATA"

## UX, end to end

First run in a repo — no .saatchi/ yet — scaffolds it and stops:

    $ nix run github:juspay/saatchi
    saatchi: no .saatchi/ here — scaffolded one:
      .saatchi/mod.just      ← EDIT ME: the `serve` recipe starts your app
      .saatchi/evidence.ts   ← the example section; make it yours
      .saatchi/fixtures/     ← default data to serve
      .saatchi/.gitignore
    saatchi: edit mod.just, then run me again.

Every run after:

    $ nix run github:juspay/saatchi
    saatchi: app  → up 2.1s, ready
    saatchi: shot → .saatchi/shots/before-dismiss.png
    saatchi: shot → .saatchi/shots/after-dismiss.png
    saatchi: shot → .saatchi/shots/resumed-returns.png
    saatchi: clean (3 shots, 11.4s)

Failure — loud and situated:

    saatchi: FAIL at shot "resumed-returns" — TimeoutError: waitFor …
    saatchi: app.log tail ↓
      [strip] membership: pr-author dismissed=true   ← the bug, visible
    saatchi: kept 2 shots; .saatchi/ left as-is; exit 1

    0  section done   1  section threw   2  app failed to boot (app.log whole)
    Always: every process saatchi started is dead on exit.

## The section

Default-export one async function; `page` arrives past readiness.

    // .saatchi/evidence.ts
    import type { Saatchi } from "saatchi"

    export default async ({ page, shot }: Saatchi) => {
      await page.getByRole("button", { name: "agent" }).click()
      await page.getByText("pr-author").waitFor()
      await shot("before-dismiss")

      await page.getByLabel("dismiss pr-author").click()
      await shot("after-dismiss")

      await page.getByPlaceholder("ask the agent…").fill("@pr-author also fix the docs")
      await page.keyboard.press("Enter")
      await page.getByText("pr-author").waitFor({ timeout: 15_000 })
      await shot("resumed-returns")
    }

Sections are throwaway: never committed; pasted into the PR body (a
`<details>` block) beside their published shots.

## Publishing the shots

After a run, from the same worktree — publish takes no arguments either:

    nix run github:juspay/saatchi#publish

Everything .saatchi/shots/ holds goes up, one POST per shot to the repo's
user-attachments endpoint — the repo is the one `gh repo view` sees here,
the token is `gh auth token`. Any .webm is transcoded to mp4 first
(ffmpeg; on failure you get ffmpeg's own words). stdout is exactly ONE
markdown block:

    ![before-dismiss](https://github.com/user-attachments/assets/…)
    ![after-dismiss](https://github.com/user-attachments/assets/…)

    https://github.com/user-attachments/assets/…

Images embed; a video is a bare URL on its own line — GitHub renders a
player for it, while image syntax renders nothing. Everything saatchi
says goes to stderr, so the block is safe to append to a draft body:

    nix run github:juspay/saatchi#publish >> body.md

Paste body.md into the PR body (say under `## Evidence`, beside the
section's `<details>`). Failures are named: no shots → it says so;
401/403 → the auth story; 404 → repo id or push rights; 422 → an
unsupported type, the file named. A run that lands only some shots
reports what landed and what didn't, exit 1.
