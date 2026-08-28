# env from saatchi: PORT (bind), HOME (already .saatchi/home), DATA (serve this)
#
# THIS RECIPE RUNS IN SAATCHI'S BARE ENV, not the consumer repo's.
# `bun` works here only because saatchi put it on PATH. Your app's
# toolchain is not ambient — re-enter it or you get exit 127:
#   exec nix develop --command bun run …
serve:
    #!/usr/bin/env bash
    set -euo pipefail
    cd {{justfile_directory()}}/..
    exec bun run app.ts
