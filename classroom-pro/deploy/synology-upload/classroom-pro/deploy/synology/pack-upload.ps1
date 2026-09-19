# Pack upload folder for Synology (exclude node_modules / dist / data)
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$Out = Join-Path $PSScriptRoot "..\synology-upload\classroom-pro"
if (Test-Path $Out) { Remove-Item $Out -Recurse -Force }
New-Item -ItemType Directory -Path $Out | Out-Null

function Copy-Filtered($srcRel, $destRel) {
  $src = Join-Path $Root $srcRel
  $dest = Join-Path $Out $destRel
  New-Item -ItemType Directory -Path $dest -Force | Out-Null
  robocopy $src $dest /E /NFL /NDL /NJH /NJS /nc /ns /np `
    /XD node_modules dist data .git `
    /XF *.db | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed: $src -> $dest ($LASTEXITCODE)" }
}

Copy-Filtered "server" "server"
Copy-Filtered "client" "client"

$SynOut = Join-Path $Out "deploy\synology"
New-Item -ItemType Directory -Path $SynOut -Force | Out-Null
@(
  "Dockerfile",
  "docker-compose.yml",
  "env.example",
  "reverse-proxy备注.txt",
  "SYNOLOGY-部署说明.md",
  "上传内容清单.txt",
  "pack-upload.ps1"
) | ForEach-Object {
  $p = Join-Path $PSScriptRoot $_
  if (Test-Path $p) { Copy-Item $p $SynOut -Force }
}

$List = Join-Path $Out "UPLOAD-LIST.txt"
@"
classroom-pro Synology upload pack
Upload this folder to: /volume1/docker/classroom-pro/
Then create project from: deploy/synology/docker-compose.yml
Copy env.example to .env and edit PUBLIC_URL / HOST_PORT
See: deploy/synology/SYNOLOGY-部署说明.md
"@ | Set-Content -Path $List -Encoding UTF8

Write-Host "OK: $Out"
(Get-ChildItem $Out -Recurse -File).Count
