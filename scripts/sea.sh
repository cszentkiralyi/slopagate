#!/bin/sh

SEA_JS="src/sea.js"

npx esbuild src/slopagate.js --bundle \
  --outfile="$SEA_JS" \
  --platform=node \
  --format=cjs \
  --target=node25
  
node --build-sea sea.json && rm "$SEA_JS"