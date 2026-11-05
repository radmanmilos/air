@echo off
set FAKE_TOOL=github-copilot
node "%~dp0fake-executor.mjs" %*
