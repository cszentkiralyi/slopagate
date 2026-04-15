#!/bin/sh

loading_text="$1"

LOADING_ANIMATION=('[    ]' '[=   ]' '[==  ]' '[=== ]' '[ ===]' '[  ==]' '[   =]')

anim_idx=0

while true; do
  printf "\r%s %s" "${LOADING_ANIMATION[$anim_idx]}" "$loading_text"
  anim_idx=$anim_idx+1
  if [[ "$anim_idx" -ge "${#LOADING_ANIMATION[@]}" ]]; then
    anim_idx=0
  fi
  sleep 0.2
done
