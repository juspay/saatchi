# saatchi — photograph an app doing the thing

*(Tamil சாட்சி: witness, evidence. github.com/juspay/saatchi.)*

    nix run github:juspay/saatchi

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
    └── shots/          throwaway  one png per shot() call

    ready  = the app's port answers 200
    fresh  = git clean -fx .saatchi/
    video  = `export const record = true` in the section (mp4 instead of stills)

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
`<details>` block) beside their shots.

## The saatchi repo

    saatchi/
    ├── flake.nix        the app; inputs: nixpkgs only
    ├── flake.lock
    ├── saatchi.sh       composition, teardown trap
    ├── lib/
    │   ├── drive.ts     readiness → { page, shot } → section import
    │   └── video.ts     record = true
    ├── scaffold/        what the first run writes into a bare repo
    │   ├── mod.just
    │   ├── evidence.ts
    │   └── gitignore
    ├── example/         a complete consumer, IN the repo — the dogfood
    │   ├── app.ts       ~20-line web app (serves DATA as an html list)
    │   └── .saatchi/    photographs it; saatchi's own CI runs exactly this
    │       ├── mod.just
    │       ├── fixtures/
    │       └── evidence.ts   (committed HERE — the example is not throwaway)
    └── README.md        this document, near verbatim

    {
      description = "saatchi: photograph an app doing the thing";
      inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
      outputs = { self, nixpkgs }:
        let forAllSystems = f: nixpkgs.lib.genAttrs
          [ "x86_64-linux" "aarch64-darwin" ]
          (system: f nixpkgs.legacyPackages.${system});
        in {
          apps = forAllSystems (pkgs: {
            default = {
              type = "app";
              program = nixpkgs.lib.getExe (pkgs.writeShellApplication {
                name = "saatchi";
                runtimeInputs = [ pkgs.bun pkgs.just pkgs.playwright-driver.browsers pkgs.ffmpeg ];
                text = ''
                  export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}
                  exec bash ${./saatchi.sh} "$@"
                '';
              });
            };
          });
        };
    }

The example doubles as the test: saatchi's CI is `cd example && nix run ..`
asserting three shots exist. A consumer learns by reading example/, not docs.
