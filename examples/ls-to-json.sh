#!/bin/bash

# xyOps Shell Script: ls -lart to JSON
# This script runs ls -lart and outputs structured JSON data
# that can be consumed by downstream xyOps actions like File Export

# Run ls and parse output to JSON array
# Skip the "total" line and parse each file entry

json_array="["
first=true

while IFS= read -r line; do
    # Skip empty lines and "total" line
    [[ -z "$line" ]] && continue
    [[ "$line" =~ ^total ]] && continue
    
    # Parse ls -l output columns
    # Format: permissions links owner group size month day time/year name [-> target]
    
    # Use awk to parse the fixed columns (1-8)
    perms=$(echo "$line" | awk '{print $1}')
    links=$(echo "$line" | awk '{print $2}')
    owner=$(echo "$line" | awk '{print $3}')
    group=$(echo "$line" | awk '{print $4}')
    size=$(echo "$line" | awk '{print $5}')
    month=$(echo "$line" | awk '{print $6}')
    day=$(echo "$line" | awk '{print $7}')
    time_year=$(echo "$line" | awk '{print $8}')
    # Name and everything after (column 9+)
    name_part=$(echo "$line" | awk '{for(i=9;i<=NF;i++) printf "%s%s", $i, (i<NF?" ":""); print ""}')
    
    # Skip if we couldn't parse (e.g., malformed line)
    [[ -z "$perms" ]] && continue
    
    # Determine file type from first character of permissions
    case "${perms:0:1}" in
        d) file_type="directory" ;;
        l) file_type="symlink" ;;
        -) file_type="file" ;;
        b) file_type="block_device" ;;
        c) file_type="char_device" ;;
        p) file_type="pipe" ;;
        s) file_type="socket" ;;
        *) file_type="unknown" ;;
    esac
    
    # Check if it's a symlink (contains " -> ")
    symlink_target=""
    display_name="$name_part"
    if [[ "$name_part" == *" -> "* ]]; then
        display_name="${name_part%% -> *}"
        symlink_target="${name_part#* -> }"
    fi
    
    # Escape special characters for JSON
    escape_json() {
        local str="$1"
        str="${str//\\/\\\\}"    # Escape backslashes
        str="${str//\"/\\\"}"    # Escape quotes
        str="${str//$'\t'/\\t}"  # Escape tabs
        str="${str//$'\n'/\\n}"  # Escape newlines
        echo "$str"
    }
    
    display_name=$(escape_json "$display_name")
    symlink_target=$(escape_json "$symlink_target")
    
    # Build JSON object
    if [ "$first" = true ]; then
        first=false
    else
        json_array+=","
    fi
    
    json_object="{"
    json_object+="\"name\":\"$display_name\","
    json_object+="\"type\":\"$file_type\","
    json_object+="\"permissions\":\"$perms\","
    json_object+="\"links\":$links,"
    json_object+="\"owner\":\"$owner\","
    json_object+="\"group\":\"$group\","
    json_object+="\"size\":$size,"
    json_object+="\"month\":\"$month\","
    json_object+="\"day\":\"$day\","
    json_object+="\"time\":\"$time_year\""
    
    # Add symlink target if present
    if [[ -n "$symlink_target" ]]; then
        json_object+=",\"target\":\"$symlink_target\""
    fi
    
    json_object+="}"
    json_array+="$json_object"
    
done < <(ls -lart /)

json_array+="]"

# Output to xyOps - this sends structured data to the next job/action
# The data will be available in job.output.data for downstream plugins
echo "{\"xy\":1,\"code\":0,\"description\":\"Listed $(echo "$json_array" | grep -o '{' | wc -l | tr -d ' ') items\",\"data\":$json_array}"
