@echo off
REM EA Cloud MT5 Trade Execution Service launcher (Windows VPS)
REM 1) Make sure the MetaTrader 5 terminal is installed and has logged in once.
REM 2) Run this file. It installs deps (first run) and starts the API on port 8000.

cd /d "%~dp0"

python -m pip install --upgrade pip
python -m pip install -r requirements.txt

REM Bind to all interfaces so the EA Cloud backend can reach it.
python -m uvicorn main:app --host 0.0.0.0 --port 8000
