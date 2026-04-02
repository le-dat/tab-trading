#!/bin/bash
# Hook: Automatically lint after editing/writing a file
# Only lints the changed file for faster performance

CHANGED_FILE="${CHANGED_FILE:-$1}"

if [ -f "package.json" ] && [ -n "$CHANGED_FILE" ]; then
  # Only lint .ts, .tsx, .js, .jsx files
  if [[ "$CHANGED_FILE" =~ \.(ts|tsx|js|jsx)$ ]]; then
    npx eslint "$CHANGED_FILE" --fix --quiet
  fi
fi
