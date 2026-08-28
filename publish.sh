#!/usr/bin/env bash
# publish: the shots leave the machine. no flags, no arguments, ever.
set -euo pipefail

if [[ $# -ne 0 ]]; then
  # stdout is the markdown block, always; even the refusal talks on stderr
  printf '%s\n' "saatchi: no flags, no arguments, ever" >&2
  exit 1
fi

SAATCHI_ROOT="${SAATCHI_ROOT:-$(cd "$(dirname "$0")" && pwd)}"

# teardown parity with saatchi.sh: publish spawns ffmpeg/curl through bun,
# and a signal to this wrapper must not orphan them into .saatchi/shots/.
child_pid=""

kill_tree() {
  local pid="$1"
  local sig="$2"
  kill "-${sig}" -- "-${pid}" 2>/dev/null || true
  if command -v pkill >/dev/null 2>&1; then
    pkill "-${sig}" -P "${pid}" 2>/dev/null || true
  fi
  kill "-${sig}" "${pid}" 2>/dev/null || true
}

teardown() {
  # ignore further signals: a second one in the grace window must not
  # abort before KILL, and HUP/QUIT must not skip us
  trap '' EXIT INT TERM HUP QUIT
  if [[ -n "${child_pid}" ]]; then
    kill_tree "${child_pid}" TERM
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 "${child_pid}" 2>/dev/null || break
      sleep 0.1
    done
    kill_tree "${child_pid}" KILL
    wait "${child_pid}" 2>/dev/null || true
    child_pid=""
  fi
}

signal_exit() {
  # $1 = signal number
  teardown
  exit "$((128 + $1))"
}

trap teardown EXIT
trap 'signal_exit 2' INT
trap 'signal_exit 15' TERM
trap 'signal_exit 1' HUP
trap 'signal_exit 3' QUIT

# bun runs in the BACKGROUND (own process group) and we wait: a trapped
# signal interrupts `wait` at once; a foreground child would defer the
# trap until it exits on its own
set -m
bun "${SAATCHI_ROOT}/lib/publish.ts" &
child_pid=$!
set +m

code=0
wait "${child_pid}" || code=$?
exit "${code}"
