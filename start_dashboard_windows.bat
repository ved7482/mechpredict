@echo off
set "ROOT=%~dp0"
start "Predictive Maintenance - Flask" powershell -NoExit -ExecutionPolicy Bypass -Command "& { Set-Location -LiteralPath '%ROOT%backend'; if (-not (Test-Path '.venv')) { py -3 -m venv .venv }; & '.\.venv\Scripts\Activate.ps1'; pip install -r requirements.txt; python app.py }"
start "Predictive Maintenance - React" powershell -NoExit -ExecutionPolicy Bypass -Command "& { Set-Location -LiteralPath '%ROOT%frontend'; if (-not (Test-Path 'node_modules')) { npm install }; npm run dev }"
echo Starting Flask and React in separate PowerShell windows.
echo Open http://127.0.0.1:5173 once both terminals finish starting.
pause
