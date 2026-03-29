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
  
Prompt Commands
  Prompts are inherently chats with an agent, and can be used to brainstorm,
  plan, or implement; but they support other syntax:
  
  !    Run a shell command
  /    Run a harness command (defined in the core, or a shell script in the
       commands/ folder of .slop/, or ~/.config/slopagate)

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


## Color utils & title banner

color_bold() {
  printf '\033[1;37m%s\033[0m' "$1"
}

color_system() {
  printf '\033[38:5:243m%s\033[0m' "$1"
}

color_muted() {
  printf '\033[1;30m%s\033[0m' "$1"
}


title_banner() {
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

color_bold "$(title_banner)"
printf "\n\n"


## Config


if [[ -n "$SLOP_VERBOSE" ]]; then
  set -e
fi

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
color_system "$(printf "Endpoint: %s" "$SLOP_CONNECTION")"
printf "\n"
if [[ -z "$SLOP_MODEL" ]]; then
  SLOP_MODEL="qwen3.5:4b-32k" # Or any other model
fi
color_system "$(printf "Model: %s" "$SLOP_MODEL")"
printf "\n"

# Creates config directories
mkdir -p ~/.config/slopagate/
mkdir -p ~/.config/slopagate/history

SLOP_PROMPT=""

# Read prompts from files, overriding if they exist
if [[ -f ~/.config/slopagate/SLOP.md ]]; then
  color_system "Loading ~/.config/slopagate/..."
  printf "\n"
  SLOP_PROMPT=$(cat ~/.config/slopagate/slop.md)
fi
if [[ -f ./.slop/SLOP.md ]]; then
  color_system "Loading .slop/..."
  printf "\n"
  SLOP_PROMPT=$(cat ./.slop/SLOP.md)
fi
if [[ -f ./.SLOP.md ]]; then
  color_system "Loading .SLOP.md..."
  printf "\n"
  SLOP_PROMPT=$(cat ~/.SLOP.md)
fi
SLOP_PROMPT=$(printf "%s" "$SLOP_PROMPT" | jq -Rasr '.')
#SLOP_PROMPT=${SLOP_PROMPT//$'\n'/\\n} # Escape newlines
#SLOP_PROMPT=$(printf "%s" "$SLOP_PROMPT" | sed -e 's/"/\\"/g') # Escape double quotes

# Set up temp dir
if [[ ! -d .sloptmp ]]; then
  mkdir .sloptmp
fi
trap "rm -rf .sloptmp" EXIT

# 16-character random alphanumeric, based on 100 bytes from /dev/urandom that get shuffled. It's not
# secure or 100% unique, but it's solidly "good enough" for me.
SLOP_CHAT_ID=$(head -c 100 /dev/urandom | shuf | tr -dc A-Za-z0-9 | cut -c 1-16)
eval SLOP_SESSION_HISTORY="~/.config/slopagate/history/${SLOP_CHAT_ID}"
#eval SLOP_CHAT_LOG="~/.config/slopagate/history/${SLOP_CHAT_ID}"
#touch "${SLOP_CHAT_LOG}"

# TODO: -s|--session option that lets you resume from ~/.config/slopagate/history/
#SLOP_SESSION_HISTORY=".slop_history"
if [[ ! -f "$SLOP_SESSION_HISTORY" ]]; then
  touch "$SLOP_SESSION_HISTORY"
fi


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
#  {
#    \"type\": \"function\",
#    \"function\": {
#      \"name\": \"backup\",
#      \"description\": \"Back up a file\",
#      \"parameters\": {
#        \"type\": \"object\",
#        \"properties\": {
#          \"file_name\": { \"type\": \"string\" }
#        },
#        \"required\": [ \"file_name\" ]
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
          \"file_path\": { \"type\": \"string\" },
          \"start_line\": { \"type\": \"integer\" },
          \"end_line\": { \"type\": \"integer\" }
        },
        \"required\": [ \"file_path\" ]
      }
    }
  },
  {
    \"type\": \"function\",
    \"function\": {
      \"name\": \"ls\",
      \"description\": \"List the contents of a directory, or the current one\",
      \"parameters\": {
        \"type\": \"object\",
        \"properties\": {
          \"directory\": { \"type\": \"string\" }
        }
      }
    }
  },
  {
    \"type\": \"function\",
    \"function\": {
      \"name\": \"edit\",
      \"description\": \"Edit a file to insert text starting at a line, or replace text in a range\",
      \"parameters\": {
        \"type\": \"object\",
        \"properties\": {
          \"file_path\": { \"type\": \"string\" },
          \"content\": { \"type\": \"string\" },
          \"start_line\": { \"type\": \"integer\" },
          \"end_line\": { \"type\": \"integer\" }
        }
      },
      \"required\": [ \"file_path\", \"content\", \"start_line\" ]
    }
  }
]"
SLOP_TOOLS_JSON=$(printf "%s" "$SLOP_TOOLS_JSON" | jq -c)


## Implementation

log() {
  if [[ "$SLOP_VERBOSE" ]]; then
    printf "%s\n" "$1" >> slop.log
  fi
}

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
    if [[ -z "$msg" ]]; then
      printf "ERROR: can't send a blank messages payload!"
      exit 1;
    fi
    
    local session_hist="$(cat "$SLOP_SESSION_HISTORY")"
    local ctx_msg="$session_hist$msg"
    printf "%s\n" "$ctx_msg," > "$SLOP_SESSION_HISTORY"

    local JSON_PAYLOAD="{
      \"model\": \"$SLOP_MODEL\",
      \"think\": false,
      \"stream\": false,
      \"messages\": [$ctx_msg],
      \"tools\": $SLOP_TOOLS_JSON
    }"
    
    printf "%s\n" "$JSON_PAYLOAD" > "json_log.json"
    RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -d "$JSON_PAYLOAD" "$SLOP_CONNECTION")
    printf "%s\n" "$RESPONSE" >> "json_log.json"
    printf "%s" "$RESPONSE"
}

send_ollama_message() {
    local msg_role="$1"
    local msg_val="$2"

    local msg="{ \"role\": \"$msg_role\", \"content\": $(printf "%s" "$msg_val" | jq -Rsa '.') }"
    
    printf "%s" $(send_raw_ollama_message "$msg")
}


# Tools implementations
handle_model_tool() {
  local tool_call="$1"
  local call_id=$(printf "%s" "$tool_call" | jq -r '.id')
  local call_name=$(printf "%s" "$tool_call" | jq -r '.function.name')
  local call_arguments=$(printf "%s" "$tool_call" | jq -rc '.function.arguments')
  local call_result=""
  
  if [[ "$call_name" = "shell" ]]; then
    local call_command=$(printf "%s" "$call_arguments" | jq -r '.command')
    local call_args=$(printf "%s" "$call_arguments" | jq -r '.arguments')

    color_muted "$(printf "Running shell command \"%s %s\"" "$call_command" "$call_args")"
    echo -e "\n"

    call_result=$($call_command $call_args 2>&1 | printf "%q")

  elif [[ "$call_name" = "ls" ]]; then
    call_directory=""
    call_directory=$(printf "%s" "$call_arguments" | jq -r '.directory')
    if [[ -z "$call_directory" || "$call_directory" = "null" ]]; then
      call_directory="."
    fi
    
    # TODO: this keeps printing "Listing" with no inner quotes at all?? no $call_directory either
    # but the quotes thing is absolutely terrifying. Where do they go?
    color_muted "$(printf "Listing \"%s\"" "$call_directory")"
    echo -e "\n"
    call_result=$(ls "$call_directory")

  elif [[ "$call_name" = "read" ]]; then
    local call_file=$(printf "%s" "$call_arguments" | jq -r '.file_path')
    local call_sline=$(printf "%s" "$call_arguments" | jq -r '.start_line')
    local call_eline=$(printf "%s" "$call_arguments" | jq -r '.end_line')

    color_muted "$(printf "Reading \"%s\"" "$call_file")"
    echo -e "\n"
    
    if [[ ! -f "$call_file" ]]; then
      call_result=$(printf "\"%s\": not found" "$call_file")
    elif [[ "$call_sline" = "null" && "$call_eline" = "null" ]]; then
      call_result=$(cat $call_file 2>&1)
    elif [[ "$call_sline" != "null" && "$call_eline" = "null" ]]; then
      call_result=$(tail --lines="-$call_sline" $call_file 2>&1)
    elif [[ "$call_sline" = "null" && "$call_eline" != "null" ]]; then
      call_result=$(head --lines="$call_eline" $call_file 2>&1)
    elif [[ "$call_sline" != "null" && "$call_eline" != "null" ]]; then
      local read_len=$call_eline - $call_sline
      call_result=$(tail --lines="-$call_sline" $call_file 2>&1 | head --lines="$read_len" 2>&1)
    else
      printf "Tool \"%s\" encountered a fatal error: nonsensical arguments %s" "$call_name" "$call_arguments"
      exit 1
    fi
    
  elif [[ "$call_name" = "edit" ]]; then
    local call_file=$(printf "%s" "$call_arguments" | jq -r '.file_path')
    local call_content=$(printf "%s" "$call_arguments" | jq -r '.file_content')
    local call_sline=$(printf "%s" "$call_arguments" | jq -r '.start_line')
    local call_eline=$(printf "%s" "$call_arguments" | jq -r '.end_line')

    color_muted "$(printf "Editing \"%s\"" "$call_file")"
    echo -e "\n"
    

    if [[ "$call_sline" != "null" && "$call_eline" = "null" ]]; then
      if [[ -f "$call_file" ]]; then
        head --lines="$call_sline" "$call_file" > .sloptmp/edit
      fi
      printf "%s" "$call_content" >> .sloptmp/edit
      if [[ -f "$call_file" ]]; then
        tail --lines="-$call_sline" "$call_file" >> .sloptmp/edit
      fi
      cat .sloptmp/edit > "$call_file"
      rm .sloptmp/edit
      call_results=$(printf "\"%s\": wrote changes" "$call_file")

      # TODO: replace between start & end with content
    fi
    
    
  elif [[ "$call_name" = "backup" ]]; then
    local call_file=$(printf "%s" "$call_arguments" | jq -r '.file_name')

    color_muted $(printf "Backing up \"%s\"" "$call_file")
    echo -e "\n"

    call_result=$(cp "$call_file" "$call_file.bak")
  fi
  
  if [[ -n "$call_result" ]]; then
    call_result=$(printf "%s" "$call_result" | jq -Rasr)
    printf "{\"role\":\"tool\",\"tool_name\":\"%s\",\"id\":\"%s\",\"content\":%s}\n"  "$call_name" "$call_id" "$call_result" >> .sloptmp/tools
  fi
}

handle_model_response() {
  local line="$1"

  local line_message=$(printf "%s" "$line" | jq -ec '.message')
  if [[ -z "$line_message" ]]; then
    return
  fi
  printf "%s,\n" "$line_message" >> "$SLOP_SESSION_HISTORY"

  local line_content=$(printf "%s" "$line_message" | jq -r '.content')
  if [[ -n "$line_content" ]]; then
    echo -e "$line_content" | vendor/glow/glow
  fi

  local message_tools=$(printf "%s" "$line_message" | jq -c '.tool_calls')
  if [[ "$message_tools" && "$message_tools" != "null" ]]; then
    # [{ id, function: { index, name, arguments } }, ...]
    if [[ ! -f .sloptmp/tools ]]; then
      touch .sloptmp/tools
    fi
    echo "" > .sloptmp/tools
    printf "%s" "$message_tools" | jq -c '.[]' | while IFS="" read -r tool_call; do
      handle_model_tool "$tool_call"
    done
    if [[ -s .sloptmp/tools ]]; then
      # MUST cat directory into string_join, var=$(cat ...) and then echo/printf-ing didn't work
      local tools_commas=$(cat .sloptmp/tools | string_join ',')
      rm .sloptmp/tools
      RESPONSE=$(send_raw_ollama_message "$tools_commas")
      handle_curl_response "$RESPONSE"
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
    color_bold "$(title_banner)"
    printf "\n\n"
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
  if [[ "$user_input" =~ ^!(.*) ]]; then
    ${BASH_REMATCH[1]}
  elif [[ "$user_input" =~ ^/(.*) ]]; then
    handle_user_command "${BASH_REMATCH[1]}"
  else
    # Doesn't work, we just freeze on this line without hitting the first line of loading_spinner
    #local spin_pid=$(loading_spinner "Thinking..." &)
    # TODO: once we have chat history sent in each message for context, no need to inject the
    # slop prompt into every message
    RESPONSE=$(send_ollama_message "user" "$user_input")
    #kill "$spin_pid" 2>/dev/null # kill the spinner if we're still going, ignore a "not found"
    handle_curl_response "$RESPONSE"
  fi
}



## Main REPL

printf "" > json_log.json

color_system "Connecting..."

SYSTEM_RESP=$(send_raw_ollama_message "{ \"role\": \"system\", \"content\": $SLOP_PROMPT }")

printf "\r"
color_bold "$(printf "Started session %s.\n\n" "$SLOP_CHAT_ID")"
printf "\n\n"

while true; do
  printf "\n"
  #read -e -p "$(color_bold "> ")" user_prompt
  read -e -p "$(color_bold "❯ ")" user_prompt
  printf "\n"
  handle_user_input "$user_prompt"
done
