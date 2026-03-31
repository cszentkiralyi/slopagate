#!/bin/bash

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
  
System Prompts (in order of priority):
  .slop/SYSTEM.md          Project system prompt.
  ~/.slopagate/SYSTEM.md   Global system prompt.

Project Files:
  ~/.slopagate/SLOP.md   Global base instructions.
  .slop/SLOP.md          Project override.
  .SLOP.md               Local template override.
  
Commands, Tools, and Agents
  - Will be loaded from ./.slop or ~/.slopagate in that order
  - Commands are .sh files under commands/
  - Tools are .sh files under tools/
  - Agents are .md files under agents/
  
Prompt Commands
  Prompts are inherently chats with an agent, and can be used to brainstorm,
  plan, or implement; but they support other syntax:
  
  !    Run a shell command
  /    Run a harness command (defined in the core, or a shell script in the
       commands/ folder of .slop/, or ~/.slopagate)

Notes:
  - History logs are stored in ~/.slopagate/history/<id> automatically.
  
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
  printf '\033[38:5:242m%s\033[0m' "$1"
}

color_muted() {
  printf '\033[38:5:245m%s\033[0m' "$1"
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

working_directory=$(pwd)

if [[ -z "$SLOP_PROJECT_DIR" ]]; then
  SLOP_PROJECT_DIR="$working_directory/.slop"
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


if [[ -z "$SLOP_HISTORY_DIR" ]]; then
  eval SLOP_HISTORY_DIR="~/.slopagate/history"
fi
mkdir -p "$SLOP_HISTORY_DIR"

SLOP_SYSTEM_PROMPT=""
SLOP_PROJECT_PROMPT=""

if [[ -f ~/.slopagate/SYSTEM.md ]]; then
  SLOP_SYSTEM_PROMPT=$(cat ~/.slopagate/SYSTEM.md)
elif [[ -f .slop/SYSTEM.md ]]; then
  SLOP_SYSTEM_PROMPT=$(cat .slop/SYSTEM.md)
fi
if [[ -n "$SLOP_SYSTEM_PROMPT" ]]; then
  SLOP_SYSTEM_PROMPT=$(printf "%s" "$SLOP_SYSTEM_PROMPT" | jq -Rasr '.')
fi

# Read prompts from files, overriding if they exist
if [[ -f ~/.slopagate/SLOP.md ]]; then
  color_system "Loading ~/.slopagate/SLOP.md..."
  printf "\n"
  SLOP_PROJECT_PROMPT=$(cat ~/.slopagate/SLOP.md)
fi
if [[ -f ./.slop/SLOP.md ]]; then
  color_system "Loading .slop/SLOP.md..."
  printf "\n"
  SLOP_PROJECT_PROMPT="$SLOP_PROJECT_PROMPT\n\n$(cat ./.slop/SLOP.md)"
fi
if [[ -f ./.SLOP.md ]]; then
  color_system "Loading .SLOP.md..."
  printf "\n"
  SLOP_PROJECT_PROMPT="$SLOP_PROJECT_PROMPT\n\n$(cat ./.SLOP.md)"
fi
SLOP_PROJECT_PROMPT=$(printf "%s" "$SLOP_PROJECT_PROMPT" | jq -Rasr '.')

# 16-character random alphanumeric, based on 100 bytes from /dev/urandom that get shuffled. It's not
# secure or 100% unique, but it's solidly "good enough" for me.
SLOP_CHAT_ID=$(head -c 100 /dev/urandom | shuf | tr -dc A-Za-z0-9 | cut -c 1-16)

eval SLOP_SESSION_HISTORY="${SLOP_HISTORY_DIR}/${SLOP_CHAT_ID}"
# TODO: -s|--session option or something that lets you resume from ~/.slopagate/history/
if [[ ! -f "$SLOP_SESSION_HISTORY" ]]; then
  touch "$SLOP_SESSION_HISTORY"
fi

# Set up temp dir
if [[ ! -d ".sloptmp/$SLOP_CHAT_ID" ]]; then
  mkdir -p ".sloptmp/$SLOP_CHAT_ID" 
fi
# On exit, remove our temp dir, and then .sloptmp if no other temp dirs remain
trap "printf \"\nEnding session %s\n\" \"$SLOP_CHAT_ID\" && \
  rm -r \".sloptmp/$SLOP_CHAT_ID\" && \
  [[ \$(ls \"$SLOP_HISTORY_DIR\" | wc -l) -gt 0 ]] || rmdir .sloptmp" EXIT



# TODO: read tools from ./slop/tools/*.sh and ~/.config/slopagate/tools/*.sh
# - filename is {tool-name}.sh
# - `--json-description` flag must return JSON for the tool, to add to SLOP_TOOLS_JSON

SLOP_TOOLS_JSON="[
  {
    \"type\": \"function\",
    \"function\": {
      \"name\": \"read\",
      \"description\": \"Read a text file, either all at once or limited to a range of lines.\",
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
      \"description\": \"List the contents of a given directory, or the current one.\",
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
      \"description\": \"Make edits to a text file by replacing 'old_str' with 'new_str' in the file. If the file doesn't exist it will be created.\",
      \"parameters\": {
        \"type\": \"object\",
        \"properties\": {
          \"file_path\": { \"type\": \"string\" },
          \"old_str\": { \"type\": \"string\" },
          \"new_str\": { \"type\": \"string\" }
        }
      },
      \"required\": [ \"file_path\", \"content\", \"start_line\" ]
    }
  }
]"
SLOP_TOOLS_JSON=$(printf "%s" "$SLOP_TOOLS_JSON" | jq -c)


## Utilities

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


## Tools implementations
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
    
    color_muted "$(printf "Listing \"%s\"" "$call_directory")"
    echo -e "\n"
    call_result=$(ls -AF "$call_directory")

  elif [[ "$call_name" = "read" ]]; then
    local call_file=$(printf "%s" "$call_arguments" | jq -r '.file_path')
    local call_sline=$(printf "%s" "$call_arguments" | jq -r '.start_line')
    local call_eline=$(printf "%s" "$call_arguments" | jq -r '.end_line')

    color_muted "$(printf "Reading \"%s\"" "$call_file")"
    echo -e "\n"
    
    if [[ ! -f "$call_file" ]]; then
      call_result=$(printf "Error: path \"%s\" not found" "$call_file")
    elif [[ "$call_sline" = "null" && "$call_eline" = "null" ]]; then
      call_result=$(cat -n $call_file)
    elif [[ "$call_sline" != "null" && "$call_eline" = "null" ]]; then
      call_result=$(cat -n $call_file | tail --lines="-$call_sline" $call_file 2>&1)
    elif [[ "$call_sline" = "null" && "$call_eline" != "null" ]]; then
      call_result=$(cat -n $call_file | head --lines="$call_eline" $call_file 2>&1)
    elif [[ "$call_sline" != "null" && "$call_eline" != "null" ]]; then
      local read_len=$(($call_eline-$call_sline))
      call_result=$(cat -n $call_file | tail --lines="-$call_sline" $call_file 2>&1 | head --lines="$read_len" 2>&1)
    else
      printf "Tool \"%s\" encountered a fatal error: nonsensical arguments %s" "$call_name" "$call_arguments"
      exit 1
    fi
    
  elif [[ "$call_name" = "edit" ]]; then
    local call_file=$(printf "%s" "$call_arguments" | jq -r '.file_path')
    local call_old_str=$(printf "%s" "$call_arguments" | jq -r '.old_str')
    local call_new_str=$(printf "%s" "$call_arguments" | jq -r '.new_str')
    
    local action_str="Editing"
    if [[ ! -f "$call_file" ]]; then
      action_str="Creating"
      touch "$call_file"
    fi

    color_muted "$(printf "%s \"%s\"" "$action_str" "$call_file")"
    echo -e "\n"
    
    cp "$call_file" .sloptmp/edit
    if [[ -n "$call_old_str" ]]; then
      # Replace
      local old_str="$(printf "%s" "$call_old_str" | sed -e 's#\/#\\/#g')"
      local new_str="$(printf "%s" "$call_new_str" | sed -e 's#\/#\\/#g')"
      perl -p -i -e "s/\Q$old_str\E/$new_str/" -0777 ".sloptmp/edit"
    else
      # Append
      printf "%s" "$call_new_str" >> .sloptmp/edit
    fi
    #diff -y "$call_file" .sloptmp/edit
    #rm "$call_file" && mv .sloptmp/edit "$call_file"
    mv "$call_file" "$call_file.old" & cp .sloptmp/edit "$call_file"
    
    call_result="$(printf "Edited \"%s\" successfully" "$call_file")"

    
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


## REPL implementation
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

if [[ -n "$SLOP_SYSTEM_PROMPT" || -n "$SLOP_PROJECT_PROMPT" ]]; then
  color_system "Connecting..."
  if [[ -n "$SLOP_SYSTEM_PROMPT" ]]; then
    _system_resp=$(send_raw_ollama_message "{ \"role\": \"system\", \"content\": $SLOP_SYSTEM_PROMPT }")
  fi
  if [[ -n "$SLOP_PROJECT_PROMPT" ]]; then
    _system_resp=$(send_raw_ollama_message "{ \"role\": \"system\", \"content\": $SLOP_PROJECT_PROMPT }")
  fi
  printf "\r"
fi

color_bold "$(printf "Started session %s.\n\n" "$SLOP_CHAT_ID")"
printf "\n\n"

while true; do
  printf "\n"
  read -e -p "$(color_bold "❯ ")" user_prompt
  printf "\n"
  handle_user_input "$user_prompt"
done
