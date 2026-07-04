#!/usr/bin/env sh
set -eu

title="Pose Lab attention"
content=""
url=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --title)
      title="${2:?missing --title value}"
      shift 2
      ;;
    --content)
      content="${2:?missing --content value}"
      shift 2
      ;;
    --url)
      url="${2:?missing --url value}"
      shift 2
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [ -z "$content" ]; then
  content="$url"
fi

if [ -z "$content" ]; then
  echo "missing --content or --url" >&2
  exit 2
fi

if command -v termux-notification >/dev/null 2>&1; then
  if [ -n "$url" ]; then
    termux-notification --title "$title" --content "$content" --button1 "Open" --button1-action "termux-open-url '$url'"
  else
    termux-notification --title "$title" --content "$content"
  fi
  echo "notify_status=termux-notification"
  exit 0
fi

if command -v termux-toast >/dev/null 2>&1; then
  termux-toast "$title: $content"
  echo "notify_status=termux-toast"
  exit 0
fi

echo "notify_status=unavailable" >&2
exit 1
