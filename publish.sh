#!/usr/bin/env bash
# publish: the shots leave the machine. no flags, no arguments, ever.
set -euo pipefail

if [[ $# -ne 0 ]]; then
  # stdout is the markdown block, always; even the refusal talks on stderr
  printf '%s\n' "saatchi: no flags, no arguments, ever" >&2
  exit 1
fi

SAATCHI_ROOT="${SAATCHI_ROOT:-$(cd "$(dirname "$0")" && pwd)}"
exec bun "${SAATCHI_ROOT}/lib/publish.ts"
