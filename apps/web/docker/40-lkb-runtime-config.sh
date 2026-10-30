#!/bin/sh
# apps/web/docker/40-lkb-runtime-config.sh -- runs from /docker-entrypoint.d after the .envsh files were
# sourced (needs LKB_BASE_PATH, LKB_APP_API_BASE, LKB_HTML_DIR). Writes the runtime config the SPA reads
# and points <base href> at the base path, so ONE built image serves any APP_BASE_PATH. No secrets here:
# config.js is public.
set -eu
html="${LKB_HTML_DIR:-/usr/share/nginx/html}"
base="${LKB_BASE_PATH-}"
api="${LKB_APP_API_BASE-}"

# APP_USER_ACCOUNTS turns on the account sign-in screens (user-accounts spec, ISS-UAWEB-004). Dark by default:
# only the exact values 1 or true (any case) switch it on; anything else, including "yes", "on" or a typo, stays
# false. The raw value is never written into config.js, only the literal true or false.
case "$(printf '%s' "${APP_USER_ACCOUNTS-}" | tr 'A-Z' 'a-z')" in
  1|true) accounts="true" ;;
  *) accounts="false" ;;
esac

printf 'window.__LKB_CONFIG__ = { basePath: "%s", apiBase: "%s", userAccounts: %s };\n' "$base" "$api" "$accounts" > "$html/config.js"

# <base href="..."> makes the relative ./assets/* and ./config.js URLs resolve against the base path on
# deep links such as /knowledgebase/sessions/abc (a refresh there would otherwise ask for /knowledgebase/sessions/assets/*).
tmp="$html/.index.html.$$"
sed "s#<base href=\"[^\"]*\"#<base href=\"${base}/\"#" "$html/index.html" > "$tmp"
if ! grep -q "<base href=\"${base}/\"" "$tmp"; then
  rm -f "$tmp"
  echo "lkb: could not set <base href> in $html/index.html" >&2
  exit 1
fi
cat "$tmp" > "$html/index.html"
rm -f "$tmp"
echo "lkb: web base path '${base:-/}', api base '${api:-${base}/api}', user accounts ${accounts}"
