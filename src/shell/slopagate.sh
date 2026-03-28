#!/bin/bash
# slopagate.sh

if [[ "$1" = "help" ]]; then
  cat <<EOF
Usage: slopagate.sh [COMMAND]

Propagate slop with the lowest-common denominator: a shell script. It's no
OpenCode or Claude Code, but it will sure impersonate one badly.

Command:
  help       Display this message

Environment Variables:
  SLOP_PORT       Provider port (default: 11434).
  SLOP_HOST       Provider host (default: http://127.0.0.1).
  SLOP_ENDPOINT   Provider path (default: /api/chat).
  SLOP_MODEL      Model name (default: gemma3:4b).

Configuration Files (in order of preference):
  ./.SLOP.md                    Local template override.
  ./.slop/SLOP.md               Project template override.
  ~/.config/slopagate/SLOP.md   Personal base template.
  
Commands, Tools, and Agents
  - Will be loaded from ./.slop or ~/.config/slopagate in that order
  - Commands are .sh files under commands/
  - Tools are .sh files under tools/
  - Agents are .md files under agents/

Notes:
  - History logs are stored in ~/.config/slopagate/history/<id> automatically.
  
Dependencies
  - jq
  - Ollama
  
Credits
  (c) 2026 Chris Szentkiralyi <chris.szentkiralyi@gmail.com>
  Released under the MIT license.
EOF
  exit 0
fi


## Title banner

title_banner() {
#cat <<EOF
#
#         ████                                                   █████                        █████     
#        ░░███                                                  ░░███                        ░░███      
#  █████  ░███   ██████  ████████   ██████    ███████  ██████   ███████    ██████      █████  ░███████  
# ███░░   ░███  ███░░███░░███░░███ ░░░░░███  ███░░███ ░░░░░███ ░░░███░    ███░░███    ███░░   ░███░░███ 
#░░█████  ░███ ░███ ░███ ░███ ░███  ███████ ░███ ░███  ███████   ░███    ░███████    ░░█████  ░███ ░███ 
# ░░░░███ ░███ ░███ ░███ ░███ ░███ ███░░███ ░███ ░███ ███░░███   ░███ ███░███░░░      ░░░░███ ░███ ░███ 
# ██████  █████░░██████  ░███████ ░░████████░░███████░░████████  ░░█████ ░░██████  ██ ██████  ████ █████
#░░░░░░  ░░░░░  ░░░░░░   ░███░░░   ░░░░░░░░  ░░░░░███ ░░░░░░░░    ░░░░░   ░░░░░░  ░░ ░░░░░░  ░░░░ ░░░░░ 
#                        ░███                ███ ░███                                                   
#                        █████              ░░██████                                                    
#                       ░░░░░                ░░░░░░                                                     
#
#EOF

cat <<EOF

  ██████  ██▓     ▒█████   ██▓███   ▄▄▄        ▄████  ▄▄▄     ▄▄▄█████▓▓█████        ██████  ██░ ██ 
▒██    ▒ ▓██▒    ▒██▒  ██▒▓██░  ██▒▒████▄     ██▒ ▀█▒▒████▄   ▓  ██▒ ▓▒▓█   ▀      ▒██    ▒ ▓██░ ██▒
░ ▓██▄   ▒██░    ▒██░  ██▒▓██░ ██▓▒▒██  ▀█▄  ▒██░▄▄▄░▒██  ▀█▄ ▒ ▓██░ ▒░▒███        ░ ▓██▄   ▒██▀▀██░
  ▒   ██▒▒██░    ▒██   ██░▒██▄█▓▒ ▒░██▄▄▄▄██ ░▓█  ██▓░██▄▄▄▄██░ ▓██▓ ░ ▒▓█  ▄        ▒   ██▒░▓█ ░██ 
▒██████▒▒░██████▒░ ████▓▒░▒██▒ ░  ░ ▓█   ▓██▒░▒▓███▀▒ ▓█   ▓██▒ ▒██▒ ░ ░▒████▒ ██▒ ▒██████▒▒░▓█▒░██▓
▒ ▒▓▒ ▒ ░░ ▒░▓  ░░ ▒░▒░▒░ ▒▓▒░ ░  ░ ▒▒   ▓▒█░ ░▒   ▒  ▒▒   ▓▒█░ ▒ ░░   ░░ ▒░ ░ ▒▓▒ ▒ ▒▓▒ ▒ ░ ▒ ░░▒░▒
░ ░▒  ░ ░░ ░ ▒  ░  ░ ▒ ▒░ ░▒ ░       ▒   ▒▒ ░  ░   ░   ▒   ▒▒ ░   ░     ░ ░  ░ ░▒  ░ ░▒  ░ ░ ▒ ░▒░ ░
░  ░  ░    ░ ░   ░ ░ ░ ▒  ░░         ░   ▒   ░ ░   ░   ░   ▒    ░         ░    ░   ░  ░  ░   ░  ░░ ░
      ░      ░  ░    ░ ░                 ░  ░      ░       ░  ░           ░  ░  ░        ░   ░  ░  ░
                                                                                ░                   
                                 Propagate the slop - slopagate.sh

EOF
}

title_banner



LOADING_ANIM_CHARS=('[    ]' '[=   ]' '[==  ]' '[=== ]' '[ ===]' '[  ==]' '[   =]')
LOADING_ANIM_DELAY=0.2



## Config

if [[ -z "$SLOP_PORT" ]]; then
  SLOP_PORT="11434"
fi
if [[ -z "$SLOP_HOST" ]]; then
  SLOP_HOST="http://127.0.0.1"
fi
if [[ -z "$SLOP_ENDPOINT" ]]; then
  SLOP_ENDPOINT="/api/chat"
fi
SLOP_CONNECTION="${SLOP_HOST}:${SLOP_PORT}${SLOP_ENDPOINT}"
printf "Connection string: %s\n" "$SLOP_CONNECTION"
if [[ -z "$SLOP_MODEL" ]]; then
  SLOP_MODEL="qwen3.5:4b-32k" # Or any other model
fi
printf "Model chosen: %s\n" "$SLOP_MODEL"

# Creates config directories
mkdir -p ~/.config/slopagate/
mkdir -p ~/.config/slopagate/history

SLOP_PROMPT=""

# Read prompts from files, overriding if they exist
if [[ -f ~/.config/slopagate/SLOP.md ]]; then
  printf "Reading ~/.config/slopagate/...\n"
  SLOP_PROMPT=$(cat ~/.config/slopagate/slop.md)
fi
if [[ -f ./.slop/SLOP.md ]]; then
  printf "Reading .slop/...\n"
  SLOP_PROMPT=$(cat ./.slop/SLOP.md)
fi
if [[ -f ./.SLOP.md ]]; then
  printf "Reading .SLOP.md...\n"
  SLOP_PROMPT=$(cat ~/.SLOP.md)
fi
SLOP_PROMPT=${SLOP_PROMPT//$'\n'/\\n} # Escape newlines
SLOP_PROMPT=$(printf "%s" "$SLOP_PROMPT" | sed -e 's/"/\\"/g') # Escape double quotes

# Set up temp dir
mkdir .sloptmp
trap "rm -rf .sloptmp" EXIT

# 16-character random alphanumeric, based on 100 bytes from /dev/urandom that get shuffled. It's not
# secure or 100% unique, but it's solidly "good enough" for me.
SLOP_CHAT_ID=$(head -c 100 /dev/urandom | shuf | tr -dc A-Za-z0-9 | cut -c 1-16)
eval SLOP_CHAT_LOG="~/.config/slopagate/history/${SLOP_CHAT_ID}"
touch "${SLOP_CHAT_LOG}"

# TODO: read tools from ./slop/tools/*.sh and ~/.config/slopagate/tools/*.sh
#
# Spec
# - filename is {tool-name}.sh
# - `--json-description` flag must return JSON for the tool, to add to SLOP_TOOLS_JSON

#  {
#    \"type\": \"function\",
#    \"function\": {
#      \"name\": \"shell\",
#      \"description\": \"Run Linux shell commands in the current directory\",
#      \"parameters\": {
#        \"type\": \"object\",
#        \"properties\": {
#          \"command\": { \"type\": \"string\" }
#        },
#        \"required\": [ \"command\" ]
#      }
#    }
#  },
SLOP_TOOLS_JSON="[
  {
    \"type\": \"function\",
    \"function\": {
      \"name\": \"read\",
      \"description\": \"Read some or all of the text contents of a file\",
      \"parameters\": {
        \"type\": \"object\",
        \"properties\": {
          \"file_name\": { \"type\": \"string\" },
          \"start_line\": { \"type\": \"integer\" },
          \"end_line\": { \"type\": \"integer\" }
        },
        \"required\": [ \"file_name\" ]
      }
    }
  }
]"
SLOP_TOOLS_JSON=$(printf "%s" "$SLOP_TOOLS_JSON" | jq -c)



## Implementation

string_join() {
  local sep="$1"
  ret=""
  while read -r line; do
    if [[ -n "$ret" ]]; then
      ret=$(printf "%s%s%s" "$ret" "$sep" "$line")
    else
      ret="$line"
    fi
  done
  printf "%s" "$ret"
}

send_raw_ollama_message() {
    local msg="$1"

    local JSON_PAYLOAD="{
      \"model\": \"$SLOP_MODEL\",
      \"think\": false,
      \"stream\": false,
      \"messages\": $msg,
      \"tools\": $SLOP_TOOLS_JSON
    }"
    printf "%s\n" "$JSON_PAYLOAD" >> "json_log.json"
    
    RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -d "$JSON_PAYLOAD" "$SLOP_CONNECTION") #2>&1"
    printf "%s" "$RESPONSE"
}

send_ollama_message() {
    local msg_role="$1"
    local msg_val="$2"

    local msg="{ \"role\": \"$msg_role\", \"content\": $(printf "%s" "$msg_val"| jq -Rsa '.') }"
    printf "%s\n" "$msg" >> "$SLOP_CHAT_LOG"
    
    printf "%s" $(send_raw_ollama_message "[$msg]")
}


handle_model_tool() {
  local tool_call="$1"
  local call_id=$(printf "%s" "$tool_call" | jq -r '.id')
  local call_name=$(printf "%s" "$tool_call" | jq -r '.function.name')
  local call_arguments=$(printf "%s" "$tool_call" | jq -r '.function.arguments')
  
  if [[ "$call_name" = "shell" ]]; then
    local call_command=$(printf "%s" "$call_arguments" | jq -e '.command')
    printf "{\"role\":\"tool\",\"tool_name\":\"%s\",\"content\":%s}\n"  "$call_name" $($call_command | jq -Rsa '.') >> .sloptmp/tools
  elif [[ "$call_name" = "read" ]]; then
    local call_file=$(printf "%s" "$call_arguments" | jq -r '.file_name')
    local call_sline=$(printf "%s" "$call_arguments" | jq -r '.start_line')
    local call_eline=$(printf "%s" "$call_arguments" | jq -r '.end_line')
    
    local call_no_sline=$(test "$call_sline" = "null")
    local call_no_eline=$(test "$call_eline" = "null")
    
    if [[ $call_sline = "null" && $call_eline = "null" ]]; then
      printf "{\"role\":\"tool\",\"tool_name\":\"%s\",\"content\":%s}\n" "$call_name" "$(cat "$call_file" |  jq -Rrsac '.')" >> .sloptmp/tools
    fi
  fi
}

handle_model_response() {
  local line="$1"
  
  #printf "line=%s\n" "$line"
  local line_content=$(printf "%s" "$line" | jq -r '.message.content')
  if [[ -n "$line_content" ]]; then
    printf "%s\n" $(printf "%s" "$line" | jq -e '.message') >> "$SLOP_CHAT_LOG"
    echo -e "$line_content"
  #else
    #printf "%s\n" "$line"
  fi

  local message_tools=$(printf "%s" "$line" | jq -c '.message.tool_calls')
  if [[ "$message_tools" && "$message_tools" != "null" ]]; then
    # [{ id, function: { index, name, arguments } }, ...]
    touch .sloptmp/tools
    printf "%s" "$message_tools" | jq -c '.[]' | while IFS="" read -r tool_call; do
      handle_model_tool "$tool_call"
    done
    local tools_output=$(cat .sloptmp/tools)
    if [[ -n "$tools_output" ]]; then
      local tools_commas=$(cat .sloptmp/tools | string_join ',')
      local tools_msgs=$(printf "[%s]" "$tools_commas" | jq -c)
      RESPONSE=$(send_raw_ollama_message "$tools_msgs")
      handle_curl_response "$RESPONSE"
      rm .sloptmp/tools
    else
      printf "Tools output file appears to be empty, preserving .sloptmp/tools for posterity\n"
    fi
  fi

  local message_done=$(echo "$line" | jq -e '.done == true')
  local message_error=$(echo "$line" | jq -e '.error')
  if [[ "$message_error" && "$message_error" != "null" ]]; then
    echo "Error from endpoint: $message_error"
  fi
}

handle_curl_response() {
  resp="$1"
  printf "%s\n" "$resp" | while IFS="" read -r curl_line; do
    handle_model_response "$curl_line"
  done
}

handle_user_command() {
  command_str="$1"
  command=$(printf "%s" "$command_str" | cut -d ' ' -f 1)

  local script=""
  if [[ "$command" = "clear" ]]; then
    clear
    title_banner
    return
  elif [[ "$command" = "quit" ]]; then
    exit 0
  elif [[ "$command" = "model" ]]; then
    # TODO: once we support command args, detect $2 and set the model to it
    printf "%s" "$SLOP_MODEL"
  elif [[ -f "./.slop/commands/$1.sh" ]]; then
    script="./.slop/commands/$1.sh"
  elif [[ -f "./.config/slopagate/commands/$1.sh" ]]; then
    script="./.config/slopagate/commands/$1.sh" 
  fi
  
  if [[ -n "$script" ]]; then
    "$script"
  else
    printf "Unknown command \"%s\"\n" "$command"
  fi
}


handle_user_input() {
  local user_input="$1"
  if [[ "$user_input" =~ ^/(.*) ]]; then
    handle_user_command "${BASH_REMATCH[1]}"
  else
    # TODO: once we have chat history sent in each message for context, no need to inject the
    # slop prompt into every message
    RESPONSE=$(send_ollama_message "user" "$SLOP_PROMPT\n\n$user_input")
    #printf "RESPONSE=%s" "$RESPONSE"
    handle_curl_response "$RESPONSE"
  fi
}



## Main REPL

printf "Started session %s. Welcome to slopagate.\n\n" "$SLOP_CHAT_ID"

while true; do
  read -e -p "> " user_prompt
  handle_user_input "$user_prompt"
done
