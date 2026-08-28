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

## Using saatchi in your repo

Zero to shots on a PR, six moves:

1. `nix run github:juspay/saatchi` — no `.saatchi/` yet, so saatchi scaffolds
   one (`mod.just`, `evidence.ts`, `fixtures/`, `.gitignore`) and stops.
2. Edit `.saatchi/mod.just`'s `serve` recipe to start YOUR app in the
   foreground. The env is the whole contract: `PORT` to bind (saatchi polls
   it for a 200), `HOME` (already `.saatchi/home/`), `DATA` (`fixtures/`, or
   a `data/` you seeded). The recipe runs in saatchi's bare env, not your
   toolchain — re-enter it (`exec nix develop --command …`) — or the recipe
   dies with a 127 in app.log and saatchi exits 2 (see below).
3. Drop default data into `.saatchi/fixtures/` (tracked); a throwaway
   `.saatchi/data/` (untracked) shadows it for one-offs.
4. Write the section: `.saatchi/evidence.ts` default-exports one async
   function — `shot("name")` per beat. Add `export const record = true` for
   video instead of stills. Sections are throwaway on purpose.
5. `nix run github:juspay/saatchi` — app boots, section runs, shots land in
   `.saatchi/shots/`; exit 0/1/2 says which stage failed (below).
6. `nix run github:juspay/saatchi#publish >> body.md` — shots upload to the
   repo's user-attachments; the markdown block lands in your draft. Paste it
   under `## Evidence` on the PR, the section beside it in a `<details>`.

## The consumer's directory

    .saatchi/
    ├── mod.just        tracked    the adapter: a `serve` recipe (env: PORT, HOME, DATA)
    ├── fixtures/       tracked    default data when data/ is absent
    ├── .gitignore      tracked    scaffolded: everything below this line
    ├── evidence.ts     throwaway  the current section
    ├── home/           throwaway  the app's HOME; seed by writing into it
    ├── data/           throwaway  what the app serves, when present
    ├── app.log         throwaway  the app's stdout+stderr, captured by saatchi
    └── shots/          throwaway  one png per shot() call — or record.mp4 when
                                   recording; #publish uploads this dir

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

## Video — when the evidence is motion

One line in the section and the run records the session instead of
taking stills:

    export const record = true

playwright captures webm; saatchi transcodes in place (ffmpeg, moov at
the front so the player can start at once) and lands exactly one shot:
`.saatchi/shots/record.mp4`. `shot()` calls don't screenshot in a record
run — they still mark the section's beats in the log; keep them. A run
is whole-video or stills, not both.

#publish treats the mp4 like any other shot, and its output line is the
bare URL — which GitHub renders as a player (see Publishing below).

Prefer video when the evidence IS time passing — a stream appending, a
spinner resolving, a clock ticking (the example app keeps one ticking
for exactly this). Prefer stills for states; a reviewer scrubs stills
faster than a timeline.

## Publishing the shots

After a run, from the same worktree — publish takes no arguments either:

    nix run github:juspay/saatchi#publish

It settles the repo (`gh api repos/{owner}/{repo}` — the numeric id; the
`gh repo view --json id` one is a graph node id and the endpoint 404s on
it) and the token (`gh auth token`, handed to curl on stdin, never in
argv) BEFORE touching anything: until both pass, .saatchi/shots/ is
unmutated.

Then any .webm transcodes to mp4 (ffmpeg, `+faststart`; on failure OR an
empty success you get ffmpeg's own words). Two laws hold here: a failed
transcode's partial mp4 is deleted — a re-run can never upload a shard
of a dead run — and an existing X.mp4, in ANY case spelling, is never
overwritten: publish refuses the whole set and tells you which file
resolves it: debris of a killed/failed transcode — delete the mp4 (the
webm is the real recording; deleting IT ships the corpse); two shots on
one stem — rename one. After that, one POST per shot to the repo's
user-attachments endpoint — stall-detected, not wall-clocked: 10 s to
connect, under 10 kB/s for 20 s — each dies loud and named, with curl
`--max-time 120` as the outer bound on a genuinely slow upload.

stdout is exactly ONE markdown block:

    ![before-dismiss](https://github.com/user-attachments/assets/…)

    ![after-dismiss](https://github.com/user-attachments/assets/…)

    https://github.com/user-attachments/assets/…

Images embed; a video or pdf is a bare URL on its own line — GitHub
renders a player for a bare video URL, while image syntax there renders
nothing. Everything saatchi says goes to stderr, so the block is safe
to append to a draft body:

    nix run github:juspay/saatchi#publish >> body.md

The block ends with a blank line, so a second append stays a second
block — a bare video URL butted against the previous block would render
as a link, no player. Paste body.md into the PR body (say under
`## Evidence`, beside the section's `<details>`).

    0  every shot landed; the block on stdout is complete
    1  something didn't land — what's on stdout still landed (paste it
       whole or not at all); stderr names each file that didn't, and why

Failures are named: no shots → it says so; 401/403 → the auth story;
404 → repo id or push rights; 422 → unsupported type or a size refusal,
the file named. And the same death guarantee as saatchi itself: every
process publish started — bun, ffmpeg, curl — is dead when it exits; a
signal to the wrapper kills the whole tree.

## saatchi in the wild

- [juspay/olai's `.saatchi/`](https://github.com/juspay/olai/tree/master/.saatchi)
  — the living consumer; its `mod.just` is a worked adapter: re-enter the
  toolchain (`nix develop`), `just build-client`, `bun packages/server/src/main.ts web`,
  DATA copied out of fixtures first so a writing section mutates only throwaway state.
- [olai#419 — the comment "Evidence, republished via saatchi#publish"](https://github.com/juspay/olai/pull/419#issuecomment-5457471140)
  — shots re-uploaded through #publish, the markdown block pasted as it came out.
- [olai#421](https://github.com/juspay/olai/pull/421) — the Padi readout: its PR body's evidence block, shot by saatchi.
- [olai#422](https://github.com/juspay/olai/pull/422) — pi over acp: same shape, saatchi shots in the body.
