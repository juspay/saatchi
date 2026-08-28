# the shared law of both wrappers: every process saatchi started is dead
# when the wrapper exits. sourced by saatchi.sh and publish.sh.

kill_tree() {
  local pid="$1"
  local sig="$2"
  kill "-${sig}" -- "-${pid}" 2>/dev/null || true
  if command -v pkill >/dev/null 2>&1; then
    pkill "-${sig}" -P "${pid}" 2>/dev/null || true
  fi
  kill "-${sig}" "${pid}" 2>/dev/null || true
}

# TERM, a second of grace, KILL, reap.
kill_gracefully() {
  local pid="$1"
  kill_tree "${pid}" TERM
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    kill -0 "${pid}" 2>/dev/null || break
    sleep 0.1
  done
  kill_tree "${pid}" KILL
  wait "${pid}" 2>/dev/null || true
}
