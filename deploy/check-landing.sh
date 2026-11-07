#!/usr/bin/env bash
# Checks that Caddy serves the landing page at / and the app everywhere else, with the right caching.
# Usage: deploy/check-landing.sh https://localhost   (CURL_OPTS=-k for a local certificate)
# Used by CI after starting the production stack, and after every deploy against the live site.
set -euo pipefail

site="${1:?base URL required, e.g. https://localhost}"
# shellcheck disable=SC2086
get() { curl -fsS ${CURL_OPTS:-} "$@"; }
header() { grep -i "^$1:" | head -1 | tr -d '\r'; }
fail() { echo "FAIL: $*" >&2; exit 1; }

# 1. / is the landing page, revalidated on every visit.
page=$(get "$site/")
grep -q "Three documents in." <<<"$page" || fail "/ is not the landing page"
get -o /dev/null -D - "$site/" | header cache-control | grep -qi "no-cache" || fail "/ should be Cache-Control: no-cache"

# 2. Its hashed files live under /_landing and are cached for a year.
asset=$(grep -oE '/_landing/_next/static/[^"?]+\.(js|css)' <<<"$page" | head -1)
[ -n "$asset" ] || fail "no /_landing asset referenced from /"
headers=$(get -o /dev/null -D - "$site$asset") || fail "$asset not served"
header cache-control <<<"$headers" | grep -qi "immutable" || fail "$asset should be immutable"

# 3. Background media: served, cached for a week.
get -o /dev/null -D - "$site/media/hero-poster.webp" | header cache-control | grep -q "max-age=604800" \
  || fail "/media should be cached for a week"

# 4. The app still owns its paths: /login renders the app's sign-in page, not the landing page.
login=$(get "$site/login")
grep -q "Sign in" <<<"$login" || fail "/login is not the app"
! grep -q "Three documents in." <<<"$login" || fail "/login shows the landing page"
app_asset=$(grep -oE '/_next/static/[^"?]+\.js' <<<"$login" | head -1)
[ -n "$app_asset" ] || fail "no /_next asset on /login"
get -o /dev/null "$site$app_asset" || fail "app asset $app_asset not served"

echo "landing OK: / is the landing page, $asset immutable, /login and $app_asset are the app"
