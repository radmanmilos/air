@echo off
set FAKE_TOOL=opencode
node "%~dp0fake-executor.mjs" %*
