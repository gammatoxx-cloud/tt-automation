#!/usr/bin/env bash
# Generate ONE slide via the Higgsfield CLI and download the full-res result.
#
# Usage: gen-slide.sh <prompt-file> <output.png> [batch.config.json]
#
# Reads generation.model / aspectRatio / resolution from batch.config.json (falling back to
# nano_banana_pro / 4:5 / 2k). The Higgsfield CLI returns a result URL rather than a file, so this
# script parses that URL and downloads it with a few retries (result URLs can be flaky on a network
# blip). Exits non-zero with a readable message on failure so a batch loop can react.
set -euo pipefail

PROMPT_FILE="${1:?usage: gen-slide.sh <prompt-file> <output.png> [config.json]}"
OUT="${2:?usage: gen-slide.sh <prompt-file> <output.png> [config.json]}"
CFG="${3:-batch.config.json}"

[ -f "$PROMPT_FILE" ] || { echo "prompt file not found: $PROMPT_FILE" >&2; exit 1; }

read_cfg() { jq -r "$1 // \"$2\"" "$CFG" 2>/dev/null || echo "$2"; }
if [ -f "$CFG" ]; then
  MODEL=$(read_cfg '.generation.model' 'nano_banana_pro')
  AR=$(read_cfg '.generation.aspectRatio' '4:5')
  RES=$(read_cfg '.generation.resolution' '2k')
else
  MODEL='nano_banana_pro'; AR='4:5'; RES='2k'
fi

mkdir -p "$(dirname "$OUT")"
JOB_JSON="$(mktemp)"; ERR="$(mktemp)"
trap 'rm -f "$JOB_JSON" "$ERR"' EXIT

echo "generating: $(basename "$OUT")  [model=$MODEL ar=$AR res=$RES]" >&2
if ! higgsfield generate create "$MODEL" \
      --prompt "$(cat "$PROMPT_FILE")" \
      --aspect_ratio "$AR" --resolution "$RES" \
      --wait --json > "$JOB_JSON" 2>"$ERR"; then
  echo "generate failed for $(basename "$OUT"):" >&2
  head -c 400 "$ERR" >&2; echo >&2
  # Surface the daily-cap case explicitly — it's not a credit problem and retrying won't help.
  grep -q 'grace_daily_limit_reached' "$ERR" "$JOB_JSON" 2>/dev/null && \
    echo "-> Higgsfield daily generation cap reached (trial). Wait for reset or upgrade." >&2
  exit 1
fi

STATUS=$(jq -r '.[0].status' "$JOB_JSON" 2>/dev/null || echo '')
URL=$(jq -r '.[0].result_url' "$JOB_JSON" 2>/dev/null || echo '')
if [ "$STATUS" != "completed" ] || [ -z "$URL" ] || [ "$URL" = "null" ]; then
  echo "no completed result (status=$STATUS) for $(basename "$OUT")" >&2
  head -c 400 "$JOB_JSON" >&2; echo >&2
  exit 1
fi

for try in 1 2 3 4 5; do
  if curl -fsSL --max-time 90 -o "$OUT" "$URL"; then
    echo "ok: $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)" >&2
    exit 0
  fi
  echo "download attempt $try failed, retrying..." >&2
  sleep 4
done

echo "download failed after retries: $URL" >&2
echo "  (result URL is saved; re-run the download rather than regenerating to avoid re-spending credits)" >&2
exit 1
