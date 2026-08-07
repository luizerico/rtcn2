#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JSON="$ROOT/scripts/seed-review-issues.json"
MAP="$ROOT/scripts/seed-review-issues-result.json"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh is required" >&2
  exit 1
fi

echo "[]" >"$MAP"
count="$(jq 'length' "$JSON")"
echo "Creating $count issues..."

for i in $(seq 0 $((count - 1))); do
  item="$(jq -c ".[$i]" "$JSON")"
  category="$(jq -r '.category' <<<"$item")"
  title="$(jq -r '.title' <<<"$item")"
  severity="$(jq -r '.severity' <<<"$item")"
  location="$(jq -r '.location' <<<"$item")"
  why="$(jq -r '.why' <<<"$item")"
  fix="$(jq -r '.fix' <<<"$item")"
  md="$(jq -r '.md' <<<"$item")"
  section="$(jq -r '.section' <<<"$item")"

  body=$(cat <<EOF
## Severity
${severity}

## Location
${location}

## Why it matters
${why}

## Recommended fix
${fix}

## Reference
See [\`${md}\`](${md}) — Finding ### ${section}
EOF
)

  issue_title="[${category}] ${title}"
  echo "→ $issue_title"

  # Best-effort: use an existing label when present; otherwise create unlabeled.
  label_args=()
  existing_labels="$(gh label list --limit 200 --json name -q '.[].name' 2>/dev/null || true)"
  for candidate in "$category" "$(echo "$category" | tr '[:upper:]' '[:lower:]')" "security" "enhancement" "bug" "maintenance" "documentation"; do
    if printf '%s\n' "$existing_labels" | grep -Fxq "$candidate"; then
      label_args+=(--label "$candidate")
      break
    fi
  done

  if ((${#label_args[@]})); then
    url="$(gh issue create --title "$issue_title" --body "$body" "${label_args[@]}")"
  else
    url="$(gh issue create --title "$issue_title" --body "$body")"
  fi
  number="$(basename "$url")"

  jq --argjson section "$section" --arg category "$category" --arg title "$title" \
    --arg severity "$severity" --arg md "$md" --arg url "$url" --argjson number "$number" \
    '. + [{section:$section, category:$category, title:$title, severity:$severity, md:$md, url:$url, number:$number}]' \
    "$MAP" >"${MAP}.tmp"
  mv "${MAP}.tmp" "$MAP"
done

echo "Updating markdown files with issue links..."
python3 <<'PY'
import json, re, pathlib
root = pathlib.Path(".")
results = json.loads((root / "scripts/seed-review-issues-result.json").read_text(encoding="utf-8"))
by_md = {}
for row in results:
    by_md.setdefault(row["md"], {})[int(row["section"])] = row

for md_name, sections in by_md.items():
    path = root / md_name
    text = path.read_text(encoding="utf-8")
    def repl(match):
        n = int(match.group(1))
        row = sections.get(n)
        if not row:
            return match.group(0)
        header = match.group(0)
        # Insert issue line after the heading if not already present
        issue_line = f"\n- **GitHub issue:** [#{row['number']}]({row['url']})"
        if f"#{row['number']}" in text.split(header, 1)[-1].split("\n### ", 1)[0]:
            return header
        return header + issue_line
    text2 = re.sub(r"(?m)^### (\d+)\. .+$", repl, text)
    path.write_text(text2, encoding="utf-8")
    print(f"updated {md_name}")
PY

echo "Done."
