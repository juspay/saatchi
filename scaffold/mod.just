# env from saatchi: PORT (bind), HOME (already .saatchi/home), DATA (serve this)
#
# THIS RECIPE RUNS IN SAATCHI'S BARE ENV, not your repo's.
# saatchi puts its own bun/just/ffmpeg on PATH — not your toolchain.
# A bare `bun` / `npm` / `cargo` here is exit 127. Re-enter YOUR
# environment, then start the app:
serve:
    #!/usr/bin/env bash
    set -euo pipefail
    cd {{justfile_directory()}}/..
    exec nix develop --command bash -c 'exec your-app --port "$PORT" --dir "$DATA"'
