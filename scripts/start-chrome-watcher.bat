@echo off
cd /d "D:\BalaKavach"
echo Starting BalaKavach Chrome History Live Sync Engine...
node scripts/sync-chrome-history.mjs --watch
pause
