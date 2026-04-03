#!/bin/bash
# Hook: Runs after Claude finishes a task
# Checks lint and type errors before ending

echo "Running post-task checks..."

# Run lint if package.json exists
if [ -f "package.json" ]; then
  if npm run lint 2>/dev/null; then
    echo "✅ Lint passed"
  else
    echo "⚠️  Lint has errors — please review before committing"
  fi
fi

# Run type check if tsconfig exists
if [ -f "tsconfig.json" ]; then
  if npx tsc --noEmit --quiet 2>/dev/null; then
    echo "✅ TypeScript OK"
  else
    echo "⚠️  TypeScript errors — fix before deploying"
  fi
fi

echo "✅ Hook on-stop complete"
