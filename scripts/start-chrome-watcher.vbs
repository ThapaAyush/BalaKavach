Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "D:\BalaKavach"
WshShell.Run "node scripts/sync-chrome-history.mjs --watch", 0, False
