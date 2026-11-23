#!/bin/bash
# The weekly copy of live (Nov 22, the operations sweep). Run by launchd,
# from scripts/weekly-backup.plist, on Sundays at 10:00; a Mac asleep then
# runs it when it wakes. Only reads live (scripts/backup.mjs). Each run
# adds a line to backups/weekly.log, and a failure shows a notification,
# since nobody is watching a launchd job. See docs/operations.md.
cd "$(dirname "$0")/.." || exit 1
mkdir -p backups
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if out=$(node --env-file=.env.local scripts/backup.mjs --prod 2>&1); then
  echo "$(date '+%F %R') ok  $(echo "$out" | tail -1)" >> backups/weekly.log
else
  echo "$(date '+%F %R') FAILED" >> backups/weekly.log
  echo "$out" | tail -20 >> backups/weekly.log
  osascript -e 'display notification "See backups/weekly.log" with title "Weekly backup of the live site failed"'
  exit 1
fi
