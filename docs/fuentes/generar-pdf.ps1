# Regenera el PDF de "Endpoints implementados" desde su fuente HTML.
#   powershell -ExecutionPolicy Bypass -File docs/fuentes/generar-pdf.ps1
# Lee la versión de <meta name="doc-version"> y escribe:
#   docs/avances/endpoints-implementados_v<version>.pdf  (historial, no se sobreescribe otra versión)
#   docs/endpoints-implementados.pdf                      (copia de la última versión)
$ErrorActionPreference = 'Stop'
$docs = Split-Path -Parent $PSScriptRoot
$html = Join-Path $PSScriptRoot 'endpoints-implementados.html'
$edge = @(
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Google\Chrome\Application\chrome.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw 'No se encontró Edge ni Chrome para imprimir a PDF.' }

$version = [regex]::Match((Get-Content $html -Raw), 'name="doc-version" content="([^"]+)"').Groups[1].Value
if (-not $version) { throw 'Falta <meta name="doc-version"> en el HTML.' }

$versioned = Join-Path $docs "avances\endpoints-implementados_v$version.pdf"
$latest = Join-Path $docs 'endpoints-implementados.pdf'
New-Item -ItemType Directory -Force (Split-Path $versioned) | Out-Null

$uri = 'file:///' + ($html -replace '\\', '/')
# Edge escribe un aviso inofensivo a stderr; con 'Stop' PowerShell lo trataría como error.
$ErrorActionPreference = 'Continue'
& $edge --headless --disable-gpu --no-pdf-header-footer "--print-to-pdf=$versioned" $uri 2>&1 | Out-Null
$ErrorActionPreference = 'Stop'
Start-Sleep -Seconds 2
if (-not (Test-Path $versioned)) { throw 'No se generó el PDF.' }
Copy-Item $versioned $latest -Force
Write-Host "OK v$version -> $versioned"
