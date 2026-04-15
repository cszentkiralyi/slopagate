#!/bin/bash

# Usage: truncate.sh <lines> <location>
# Arguments:
#   lines    - Number of lines to show
#   location - "top", "bottom", or "middle"

# Mostly coded by Qwen3.5-9B running in slopagate

#set -euo pipefail

if [[ $# -ne 2 ]]; then
    echo "Usage: $0 <lines> <location>" >&2
    exit 1
fi

line_count=$1
trunc_loc="$2"

tmpfile=$(mktemp)
cat - > "$tmpfile"

COUNT=$(wc -l "$tmpfile" | cut -d ' ' -f 1)
if [[ $COUNT -lt $line_count ]]; then
    cat "$tmpfile"
    exit 0
fi

case "$trunc_loc" in
    bottom)
        head --lines="$line_count" "$tmpfile"
        printf "...\n"
        ;;
    top)
        printf "...%s\n" "$line_count"
        tail --lines="$line_count" "$tmpfile"
        ;;
    middle)
        HALF=$(( line_count / 2 ))
        head --lines="$HALF" "$tmpfile"
        printf "...\n"
        tail --lines="$((HALF + 1))" "$tmpfile"
        ;;
    *)
        echo "Invalid location: $trunc_loc. Use 'top', 'bottom', or 'middle'." >&2
        exit 1
        ;;
esac

rm "$tmpfile"