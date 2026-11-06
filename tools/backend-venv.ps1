# Builds services/backend/.venv and makes sure Python can actually run in it.
# Windows Smart App Control blocks a venv built from uv's managed Python (os error 4551) while
# `uv sync` still reports success. In that case the venv is rebuilt from a signed python.org install.
#   powershell -ExecutionPolicy Bypass -File tools\backend-venv.ps1     (works from any folder)
# Exit code: 0 venv works | 1 failed | 2 needs the user (install Python from python.org)
# Details: docs/system/08-environment.md section 5

$env:TOWNPASS_QUIET = '1'; . "$PSScriptRoot\dev-shell.ps1"; Remove-Item Env:TOWNPASS_QUIET
$Backend = Join-Path $PSScriptRoot '..\services\backend'
Set-Location $Backend

# cmd /c keeps PowerShell 5.1 from wrapping native stderr in error records
function Run($cmdline) {
  $out = (cmd /c "$cmdline 2>&1" | Out-String)
  return [pscustomobject]@{ Code = $LASTEXITCODE; Out = $out }
}
function Probe { Run 'uv run python -c "import fastapi"' }

$sync = Run 'uv sync'
if ($sync.Code -ne 0) {
  Write-Host $sync.Out
  Write-Host '[FAIL] uv sync failed' -ForegroundColor Red
  exit 1
}
$probe = Probe
if ($probe.Code -eq 0) {
  Write-Host '[ OK ] backend venv works' -ForegroundColor Green
  exit 0
}
if ($probe.Out -notmatch '4551') {
  Write-Host $probe.Out
  Write-Host '[FAIL] backend venv does not run (not a Smart App Control block)' -ForegroundColor Red
  exit 1
}

Write-Host 'Smart App Control blocked the Python that uv built the venv from (os error 4551).' -ForegroundColor Yellow
$need = [version]'3.12'
if ((Get-Content pyproject.toml -Raw) -match 'requires-python\s*=\s*"[^"]*?>=\s*(\d+)\.(\d+)') {
  $need = [version]"$($Matches[1]).$($Matches[2])"
}
$globs = @("$env:LOCALAPPDATA\Programs\Python\Python3*\python.exe", "$env:ProgramFiles\Python3*\python.exe")
$candidates = @(Get-ChildItem -Path $globs -ErrorAction SilentlyContinue |
  Sort-Object { [int]($_.Directory.Name -replace '\D', '') } -Descending)
$signed = $null
foreach ($c in $candidates) {
  $v = (cmd /c "`"$($c.FullName)`" -c `"import sys;print('%d.%d' % sys.version_info[:2])`" 2>&1" | Out-String).Trim()
  if ($v -match '^\d+\.\d+$' -and [version]$v -ge $need) { $signed = $c.FullName; break }
}
if (-not $signed) {
  Write-Host "[USER] No signed Python >= $need found. Install Python from https://www.python.org/downloads/windows/ (per user, no admin needed), then run this script again." -ForegroundColor Magenta
  exit 2
}

Write-Host "Rebuilding the venv with $signed"
$env:UV_PYTHON = $signed # uv reads the interpreter from here (no quoting trouble with spaces)
try {
  $venv = Run 'uv venv --clear .venv'
  if ($venv.Code -ne 0) { Write-Host $venv.Out; Write-Host '[FAIL] uv venv failed' -ForegroundColor Red; exit 1 }
  $sync = Run 'uv sync'
  if ($sync.Code -ne 0) { Write-Host $sync.Out; Write-Host '[FAIL] uv sync failed' -ForegroundColor Red; exit 1 }
} finally { Remove-Item Env:UV_PYTHON -ErrorAction SilentlyContinue }
$probe = Probe
if ($probe.Code -eq 0) {
  Write-Host "[ OK ] backend venv works, using signed Python: $signed" -ForegroundColor Green
  exit 0
}
Write-Host $probe.Out
Write-Host "[USER] Still blocked with $signed. Install the latest Python from https://www.python.org/downloads/windows/, then run this script again." -ForegroundColor Magenta
exit 2
