@echo off
set FAKE_TOOL=goose
node "%~dp0fake-executor.mjs" %*
