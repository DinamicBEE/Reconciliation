# Regenera el PDF de "Endpoints implementados" desde su fuente HTML.
#   powershell -ExecutionPolicy Bypass -File docs/fuentes/generar-pdf.ps1
# Lee la versión de <meta name="doc-version"> y escribe:
#   docs/avances/<Name>_v<version>.pdf  (historial, no se sobreescribe otra versión)
#   docs/<Name>.pdf                      (copia de la última versión)
#   Uso: generar-pdf.ps1 [-Name endpoints-implementados | analisis-front-vs-back-dev]
#   Con -Output <ruta> (relativa a la raíz del repo o absoluta) escribe SOLO ese archivo
#   (sin copia en docs/avances ni docs/<Name>.pdf) — p. ej. la guía de endpoints:
#   generar-pdf.ps1 -Name Guia_Endpoints_Usuarios_Roles_Permisos -Output docs/Guia_Endpoints_Usuarios_Roles_Permisos_v2.pdf
param([string]$Name = 'endpoints-implementados', [string]$Output = '')
$ErrorActionPreference = 'Stop'
$docs = Split-Path -Parent $PSScriptRoot
$html = Join-Path $PSScriptRoot "$Name.html"
$edge = @(
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Google\Chrome\Application\chrome.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw 'No se encontró Edge ni Chrome para imprimir a PDF.' }

$version = [regex]::Match((Get-Content $html -Raw), 'name="doc-version" content="([^"]+)"').Groups[1].Value
if (-not $version) { throw 'Falta <meta name="doc-version"> en el HTML.' }

if ($Output) {
  $repo = Split-Path -Parent $docs
  $versioned = if ([IO.Path]::IsPathRooted($Output)) { $Output } else { Join-Path $repo $Output }
  $latest = $null
} else {
  $versioned = Join-Path $docs "avances\${Name}_v$version.pdf"
  $latest = Join-Path $docs "$Name.pdf"
}
New-Item -ItemType Directory -Force (Split-Path $versioned) | Out-Null

$uri = 'file:///' + ($html -replace '\\', '/')
# Edge escribe un aviso inofensivo a stderr; con 'Stop' PowerShell lo trataría como error.
$ErrorActionPreference = 'Continue'
& $edge --headless --disable-gpu --no-pdf-header-footer "--print-to-pdf=$versioned" $uri 2>&1 | Out-Null
$ErrorActionPreference = 'Stop'
Start-Sleep -Seconds 2
if (-not (Test-Path $versioned)) { throw 'No se generó el PDF.' }
if ($latest) { Copy-Item $versioned $latest -Force }
Write-Host "OK v$version -> $versioned"
