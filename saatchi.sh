#!/usr/bin/env bash
# composition + teardown trap. no flags, no arguments, ever.
set -euo pipefail

if [[ $# -ne 0 ]]; then
  printf '%s\n' "saatchi: no flags, no arguments, ever"
  exit 1
fi

SAATCHI_ROOT="${SAATCHI_ROOT:-$(cd "$(dirname "$0")" && pwd)}"
cwd="$PWD"
dot="$cwd/.saatchi"

app_pid=""
run_dir=""

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
  # ignore further signals: a second ^C in the grace window must not
  # abort before KILL, and HUP/QUIT must not skip us
  trap '' EXIT INT TERM HUP QUIT
  if [[ -n "${app_pid}" ]]; then
    kill_tree "${app_pid}" TERM
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 "${app_pid}" 2>/dev/null || break
      sleep 0.1
    done
    kill_tree "${app_pid}" KILL
    wait "${app_pid}" 2>/dev/null || true
  fi
  if [[ -n "${run_dir}" && -d "${run_dir}" ]]; then
    rm -rf "${run_dir}"
  fi
}
trap teardown EXIT INT TERM HUP QUIT

indent() {
  while IFS= read -r line || [[ -n "${line}" ]]; do
    printf '  %s\n' "${line}"
  done
}

scaffold() {
  mkdir -p "${dot}/fixtures"
  cp "${SAATCHI_ROOT}/scaffold/mod.just" "${dot}/mod.just"
  cp "${SAATCHI_ROOT}/scaffold/evidence.ts" "${dot}/evidence.ts"
  cp "${SAATCHI_ROOT}/scaffold/gitignore" "${dot}/.gitignore"
  if [[ -d "${SAATCHI_ROOT}/scaffold/fixtures" ]]; then
    cp -r "${SAATCHI_ROOT}/scaffold/fixtures/." "${dot}/fixtures/"
  fi
  cat <<'EOF'
saatchi: no .saatchi/ here — scaffolded one:
  .saatchi/mod.just      ← EDIT ME: the `serve` recipe starts your app
  .saatchi/evidence.ts   ← the example section; make it yours
  .saatchi/fixtures/     ← default data to serve
  .saatchi/.gitignore
saatchi: edit mod.just, then run me again.
EOF
}

if [[ ! -d "${dot}" ]]; then
  scaffold
  exit 0
fi

if [[ ! -f "${dot}/evidence.ts" ]]; then
  printf '%s\n' "saatchi: FAIL — .saatchi/evidence.ts is missing"
  exit 1
fi
if [[ ! -f "${dot}/mod.just" ]]; then
  printf '%s\n' "saatchi: FAIL — .saatchi/mod.just is missing"
  exit 1
fi

mkdir -p "${dot}/home" "${dot}/shots"
# a run starts with a clean shot list; failure keeps this run's shots-so-far
(
  shopt -s nullglob
  for f in "${dot}/shots"/*; do
    rm -rf "${f}"
  done
)

if [[ -d "${dot}/data" ]]; then
  DATA="${dot}/data"
else
  DATA="${dot}/fixtures"
fi
HOME_DIR="${dot}/home"

PORT="$(bun -e 'const s = Bun.serve({ port: 0, fetch() { return new Response("") } }); process.stdout.write(String(s.port)); s.stop()')"
export PORT

now_ms() { bun -e 'process.stdout.write(String(Date.now()))'; }
t0="$(now_ms)"
export SAATCHI_START_MS="${t0}"
export SAATCHI_EVIDENCE="${dot}/evidence.ts"
export SAATCHI_SHOTS="${dot}/shots"

run_dir="$(mktemp -d "${TMPDIR:-/tmp}/saatchi.XXXXXX")"
mkdir -p "${run_dir}/node_modules"
ln -s "${PLAYWRIGHT_CORE:?PLAYWRIGHT_CORE is not set}" "${run_dir}/node_modules/playwright-core"
ln -s "${PLAYWRIGHT_CORE}" "${run_dir}/node_modules/playwright"
cp "${SAATCHI_ROOT}/lib/"*.ts "${run_dir}/"

: > "${dot}/app.log"
set -m
PORT="${PORT}" HOME="${HOME_DIR}" DATA="${DATA}" \
  just -f "${dot}/mod.just" serve >>"${dot}/app.log" 2>&1 </dev/null &
app_pid=$!
set +m
export SAATCHI_APP_PID="${app_pid}"

code=0
bun "${run_dir}/drive.ts" || code=$?

elapsed() {
  bun -e "process.stdout.write(((Date.now() - ${t0}) / 1000).toFixed(1))"
}

shot_count() {
  (
    shopt -s nullglob
    n=0
    for f in "${dot}/shots"/*.png "${dot}/shots"/*.mp4; do
      n=$((n + 1))
    done
    printf '%s' "${n}"
  )
}

if [[ "${code}" -eq 0 ]]; then
  n="$(shot_count)"
  printf 'saatchi: clean (%s shots, %ss)\n' "${n}" "$(elapsed)"
  exit 0
fi

if [[ "${code}" -eq 2 ]]; then
  printf 'saatchi: app.log ↓\n'
  indent < "${dot}/app.log"
  exit 2
fi

printf 'saatchi: app.log tail ↓\n'
tail -n 20 "${dot}/app.log" | indent
n="$(shot_count)"
printf 'saatchi: kept %s shots; .saatchi/ left as-is; exit 1\n' "${n}"
exit 1
