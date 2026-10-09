# Levanta la pila del backend (coctel_midd, rama DEV) para desarrollar el portal y siembra las cuentas demo.
#   powershell -ExecutionPolicy Bypass -File dev-env/levantar-backend.ps1            # levanta + siembra
#   powershell -ExecutionPolicy Bypass -File dev-env/levantar-backend.ps1 -Down      # apaga (conserva datos)
#   ... -Reseed                                                                       # solo vuelve a aplicar la siembra
#
# No modifica el repo del backend: usa SU docker-compose.yml tal cual (--project-directory) con las variables
# de dev-env/.env y un nombre de proyecto propio (coctel_dev) => volumen NUEVO (coctel_dev_coctel_postgres_data).
# Si existe una pila anterior con los mismos nombres de contenedor (docker run manual de feature/login), la
# DETIENE y la renombra a <nombre>-legacy: su volumen y sus datos quedan intactos para volver atrás.
#
# El Gateway queda en http://localhost:<GATEWAY_PORT> (8080 por defecto; proxy.conf.js lee el mismo valor de dev-env/.env).
param(
  [string]$BackendDir = (Join-Path $PSScriptRoot '..\..\coctel_midd'),
  [switch]$Down,
  [switch]$Reseed
)
$ErrorActionPreference = 'Stop'
$project = 'coctel_dev'
$backend = (Resolve-Path $BackendDir).Path
$envFile = Join-Path $PSScriptRoot '.env'
if (-not (Test-Path $envFile)) { Copy-Item (Join-Path $PSScriptRoot '.env.example') $envFile; Write-Host "Creado $envFile desde .env.example" }
# Puerto publicado del Gateway (GATEWAY_PORT en dev-env/.env, 8080 por defecto).
$gatewayPort = '8080'
$portLine = Select-String -Path $envFile -Pattern '^\s*GATEWAY_PORT\s*=\s*(\d+)' | Select-Object -First 1
if ($portLine) { $gatewayPort = $portLine.Matches[0].Groups[1].Value }
$compose = @('compose', '-p', $project, '--project-directory', $backend, '-f', (Join-Path $backend 'docker-compose.yml'),
  '-f', (Join-Path $PSScriptRoot 'docker-compose.gateway-port.yml'), '--env-file', $envFile)

function Invoke-Seed {
  Write-Host 'Aplicando siembra de cuentas demo...'
  # Se copia el archivo al contenedor y se ejecuta con psql -f: canalizar el SQL por stdin desde
  # PowerShell 5.1 pasa por la codificación de la consola y convierte los acentos en '?'.
  docker cp (Join-Path $PSScriptRoot 'seed-demo-users.sql') coctel-del-mar-postgres:/tmp/seed-demo-users.sql | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo copiar la siembra al contenedor.' }
  docker exec coctel-del-mar-postgres psql -U coctel_app -d coctel_del_mar -v ON_ERROR_STOP=1 -q -f /tmp/seed-demo-users.sql
  if ($LASTEXITCODE -ne 0) { throw 'La siembra falló.' }
}

if ($Down) { & docker @compose down; exit $LASTEXITCODE }
if ($Reseed) { Invoke-Seed; exit 0 }

# 1. Apartar contenedores de una pila anterior (otro proyecto de compose / docker run manual).
$existing = @(docker ps -a --format '{{.Names}}')
foreach ($name in 'coctel-del-mar-postgres', 'coctel-del-mar-auth-service', 'coctel-del-mar-gateway', 'coctel-del-mar-sales-service', 'coctel-del-mar-db-migration') {
  if ($existing -notcontains $name) { continue }
  $labels = (docker inspect $name | ConvertFrom-Json)[0].Config.Labels
  $owner = $labels.'com.docker.compose.project'
  if ($owner -ne $project) {
    Write-Host "Apartando contenedor anterior $name -> $name-legacy"
    docker stop $name | Out-Null
    docker rename $name "$name-legacy" | Out-Null
  }
}

# 2. Construir y levantar (db-migration crea el esquema y termina; luego auth, sales y gateway).
& docker @compose up -d --build
if ($LASTEXITCODE -ne 0) { throw 'docker compose up falló.' }

# 3. Esperar al Gateway (un POST vacío a /auth/login responde 400 cuando ya enruta).
Write-Host "Esperando al Gateway en :$gatewayPort..."
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:$gatewayPort/auth/login" -Method Post -ContentType 'application/json' -Body '{}' -UseBasicParsing -ErrorAction Stop
  } catch { if ($_.Exception.Response) { $ok = $true; break } }
  Start-Sleep -Seconds 3
}
if (-not $ok) { throw 'El Gateway no respondió a tiempo (docker compose -p coctel_dev logs gateway).' }

# 4. Sembrar las cuentas demo y el catálogo.
Invoke-Seed
Write-Host "Listo: Gateway en http://localhost:$gatewayPort - admin@conciliacion.mx / Conciliacion2026"
