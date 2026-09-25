$ErrorActionPreference = 'Stop'

$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$port = 8787
$localUrl = "http://127.0.0.1:$port/"
$runId = [Guid]::NewGuid().ToString('N')
$tempRoot = [IO.Path]::GetTempPath()
$serverStdout = Join-Path $tempRoot "hotline-viseo-server-$runId.out.log"
$serverStderr = Join-Path $tempRoot "hotline-viseo-server-$runId.err.log"
$tunnelStdout = Join-Path $tempRoot "hotline-viseo-tunnel-$runId.out.log"
$tunnelStderr = Join-Path $tempRoot "hotline-viseo-tunnel-$runId.err.log"
$serverProcess = $null
$tunnelProcess = $null

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  Write-Host 'Node.js 18 ou plus est requis. Installez-le depuis https://nodejs.org puis relancez.' -ForegroundColor Red
  exit 1
}
$nodePath = $nodeCommand.Source

$cloudflaredCommand = Get-Command cloudflared.exe -ErrorAction SilentlyContinue
if (-not $cloudflaredCommand) { $cloudflaredCommand = Get-Command cloudflared -ErrorAction SilentlyContinue }
$cloudflaredPath = if ($cloudflaredCommand) { $cloudflaredCommand.Source } else { $null }
$cachedCloudflared = Join-Path $workspaceRoot '.cache\cloudflared\cloudflared.exe'
$localCloudflared = Join-Path $workspaceRoot 'cloudflared.exe'
if (-not $cloudflaredPath -and (Test-Path -LiteralPath $cachedCloudflared -PathType Leaf)) { $cloudflaredPath = $cachedCloudflared }
if (-not $cloudflaredPath -and (Test-Path -LiteralPath $localCloudflared -PathType Leaf)) { $cloudflaredPath = $localCloudflared }
if (-not $cloudflaredPath) {
  Write-Host 'cloudflared est requis pour ouvrir le tunnel.' -ForegroundColor Red
  Write-Host 'Téléchargez cloudflared-windows-amd64.exe depuis les releases officielles :' -ForegroundColor Yellow
  Write-Host 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
  Write-Host 'Renommez-le cloudflared.exe et placez-le dans .cache\cloudflared\ à la racine du projet.'
  Write-Host "Vous pouvez aussi installer cloudflared et l'ajouter au PATH."
  exit 1
}

$cloudflaredConfigDir = Join-Path $env:USERPROFILE '.cloudflared'
$configCandidates = @(
  (Join-Path $cloudflaredConfigDir 'config.yaml'),
  (Join-Path $cloudflaredConfigDir 'config.yml')
)
$existingConfig = $configCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if ($existingConfig) {
  Write-Host "Quick Tunnel ne démarre pas avec le fichier $existingConfig." -ForegroundColor Red
  Write-Host 'Renommez temporairement ce fichier, puis relancez le launcher.'
  exit 1
}

function Read-ProcessLogs([string[]]$paths) {
  $contents = foreach ($logPath in $paths) {
    if (Test-Path -LiteralPath $logPath) {
      Get-Content -LiteralPath $logPath -Raw -ErrorAction SilentlyContinue
    }
  }
  return ($contents -join "`n")
}

function Stop-ChildProcess($process) {
  if ($null -ne $process) {
    if (-not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
      Wait-Process -Id $process.Id -Timeout 5 -ErrorAction SilentlyContinue
    }
  }
}

try {
  $serverScript = Join-Path $workspaceRoot 'tools\serve.cjs'
  $serverArguments = '"{0}" --port {1} --site-only' -f $serverScript, $port
  $serverProcess = Start-Process -FilePath $nodePath -ArgumentList $serverArguments `
    -WorkingDirectory $workspaceRoot -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $serverStdout -RedirectStandardError $serverStderr

  $serverReady = $false
  for ($attempt = 0; $attempt -lt 50; $attempt++) {
    if ($serverProcess.HasExited) {
      $serverLog = Read-ProcessLogs @($serverStdout, $serverStderr)
      throw "Le serveur local s’est arrêté au démarrage.`n$serverLog"
    }
    $response = Invoke-WebRequest -UseBasicParsing -Uri $localUrl -TimeoutSec 1 -ErrorAction SilentlyContinue
    if ($response -and $response.StatusCode -eq 200) { $serverReady = $true; break }
    Start-Sleep -Milliseconds 200
  }
  if (-not $serverReady) { throw "Le jeu ne répond pas sur le port $port. Vérifiez qu’il n’est pas déjà utilisé." }

  $tunnelArguments = 'tunnel --url http://127.0.0.1:{0}' -f $port
  $tunnelProcess = Start-Process -FilePath $cloudflaredPath -ArgumentList $tunnelArguments `
    -WorkingDirectory $workspaceRoot -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $tunnelStdout -RedirectStandardError $tunnelStderr

  $publicUrl = $null
  $deadline = (Get-Date).AddSeconds(90)
  while ((Get-Date) -lt $deadline) {
    if ($tunnelProcess.HasExited) {
      $tunnelLog = Read-ProcessLogs @($tunnelStdout, $tunnelStderr)
      throw "cloudflared s’est arrêté avant de créer le tunnel.`n$tunnelLog"
    }
    $tunnelLog = Read-ProcessLogs @($tunnelStdout, $tunnelStderr)
    $urlMatch = [regex]::Match($tunnelLog, 'https://[a-z0-9-]+\.trycloudflare\.com', [Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($urlMatch.Success) { $publicUrl = $urlMatch.Value; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $publicUrl) {
    $tunnelLog = Read-ProcessLogs @($tunnelStdout, $tunnelStderr)
    throw "Aucune URL Cloudflare reçue après 90 secondes.`n$tunnelLog"
  }

  Write-Host ''
  Write-Host 'Le jeu est accessible sur Internet :' -ForegroundColor Green
  Write-Host $publicUrl -ForegroundColor Cyan
  Write-Host 'Partagez cette URL avec vos amis. Toute personne qui la possède peut ouvrir le jeu.' -ForegroundColor Yellow
  Write-Host 'Le lien change au prochain lancement. Appuyez sur Ctrl+C ici pour fermer le tunnel et le serveur.'
  $clipboardErrors = @()
  Set-Clipboard -Value $publicUrl -ErrorAction SilentlyContinue -ErrorVariable clipboardErrors
  if ($clipboardErrors.Count -eq 0) { Write-Host 'URL copiée dans le presse-papiers.' }
  $browserErrors = @()
  $null = Start-Process $publicUrl -ErrorAction SilentlyContinue -ErrorVariable browserErrors
  if ($browserErrors.Count -gt 0) { Write-Host "Ouvrez cette URL dans votre navigateur : $publicUrl" }

  while (-not $tunnelProcess.HasExited) { Start-Sleep -Seconds 1 }
  Write-Host "Le tunnel Cloudflare s’est arrêté." -ForegroundColor Yellow
} finally {
  Stop-ChildProcess $tunnelProcess
  Stop-ChildProcess $serverProcess
  foreach ($logPath in @($serverStdout, $serverStderr, $tunnelStdout, $tunnelStderr)) {
    Remove-Item -LiteralPath $logPath -Force -ErrorAction SilentlyContinue
  }
}
