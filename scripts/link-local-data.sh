#!/usr/bin/env bash
# Recreates web/public/{tiles,data} as symlinks into the repo's own
# tiles/ and data/interim/ directories. These are gitignored (data/ and
# tiles/ patterns aren't anchored), so a fresh clone or checkout has
# neither the real directories' contents nor the symlinks — without
# this, local dev silently serves 404s for every tile and parquet
# request and the app looks empty.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -e web/public/tiles ]; then
  ln -s ../../tiles web/public/tiles
  echo "Linked web/public/tiles -> tiles/"
fi

if [ ! -e web/public/data ]; then
  ln -s ../../data/interim web/public/data
  echo "Linked web/public/data -> data/interim/"
fi
