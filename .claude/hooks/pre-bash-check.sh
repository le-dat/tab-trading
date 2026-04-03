#!/bin/bash
# Hook: Check before running a dangerous Bash command
# Blocks commands that could cause harm

COMMAND="$1"

# Check for dangerous patterns
DANGEROUS_PATTERNS=(
  "rm -rf /"
  "git push --force"
  "git push -f"
  "DROP TABLE"
  "DELETE FROM.*WHERE 1=1"
  "truncate"
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qi "$pattern"; then
    echo "🚫 BLOCKED: Dangerous command detected: '$pattern'"
    echo "Please confirm manually if you really want to run this command."
    exit 1
  fi
done

exit 0
