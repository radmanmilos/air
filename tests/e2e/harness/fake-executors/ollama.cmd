@echo off
set FAKE_TOOL=ollama
node "%~dp0fake-executor.mjs" %*
