param(
    [string]$ProjectRoot = "C:\Users\Lucas\OneDrive\Desktop\mvp_fast_track-main\mvp_fast_track-main",
    [ValidatePattern('^(main|[0-9a-f]{40})$')]
    [string]$Revision = "main"
)

$ErrorActionPreference = "Stop"
$fasttrackRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$fasttrackMobile = Join-Path $fasttrackRoot "apps\mobile"
$fasttrackCore = Join-Path $fasttrackRoot "packages\core"
foreach ($fasttrackFile in @("package.json", "package-lock.json", "apps\mobile\App.tsx", "packages\core\package.json")) {
    if (-not (Test-Path -LiteralPath (Join-Path $fasttrackRoot $fasttrackFile))) {
        throw "Pasta do projeto incorreta: $fasttrackRoot"
    }
}
if (-not (Get-Command npx.cmd -ErrorAction SilentlyContinue)) {
    throw "Abra novamente o PowerShell depois de instalar o Node.js."
}

$fasttrackTemp = Join-Path $env:TEMP ("fasttrack-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $fasttrackTemp | Out-Null
Write-Host "Baixando a atualizacao FAST TRACK..."
Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/lucaasouza2000-prog/mvp_fast_track/archive/$Revision.zip" -OutFile "$fasttrackTemp\codigo.zip"
Expand-Archive -LiteralPath "$fasttrackTemp\codigo.zip" -DestinationPath "$fasttrackTemp\codigo"
$fasttrackSource = Join-Path "$fasttrackTemp\codigo" "mvp_fast_track-$Revision"
foreach ($fasttrackFile in @("package.json", "package-lock.json", "apps\mobile\app.config.ts", "apps\mobile\assets\fast-track-logo.png", "packages\core\src\index.ts")) {
    if (-not (Test-Path -LiteralPath (Join-Path $fasttrackSource $fasttrackFile))) {
        throw "A atualizacao baixada esta incompleta. Nenhum arquivo local foi substituido."
    }
}

Write-Host "Salvando uma copia dos arquivos atuais..."
foreach ($fasttrackPart in @("mobile", "core")) {
    $fasttrackOriginal = if ($fasttrackPart -eq "mobile") { $fasttrackMobile } else { $fasttrackCore }
    $fasttrackBackup = Join-Path "$fasttrackTemp\backup" $fasttrackPart
    New-Item -ItemType Directory -Path $fasttrackBackup -Force | Out-Null
    Get-ChildItem -LiteralPath $fasttrackOriginal |
        Where-Object { $_.Name -notin @("node_modules", ".expo", "dist") -and $_.Name -notlike ".env*" } |
        Copy-Item -Destination $fasttrackBackup -Recurse -Force
}
New-Item -ItemType Directory -Path "$fasttrackTemp\backup\root" -Force | Out-Null
Copy-Item -LiteralPath "$fasttrackRoot\package.json", "$fasttrackRoot\package-lock.json" -Destination "$fasttrackTemp\backup\root"
Compress-Archive -Path "$fasttrackTemp\backup\*" -DestinationPath "$fasttrackTemp\backup.zip"
Write-Host "Copia salva em $fasttrackTemp\backup.zip"
Copy-Item -Path "$fasttrackSource\apps\mobile\*" -Destination $fasttrackMobile -Recurse -Force
Copy-Item -Path "$fasttrackSource\packages\core\*" -Destination $fasttrackCore -Recurse -Force
Copy-Item -LiteralPath "$fasttrackSource\package.json", "$fasttrackSource\package-lock.json" -Destination $fasttrackRoot -Force

Set-Location -LiteralPath $fasttrackRoot
Write-Host "Instalando as dependencias atualizadas do aplicativo..."
npm.cmd ci
if ($LASTEXITCODE -ne 0) {
    throw "A instalacao das dependencias falhou. A compilacao nao foi iniciada. Backup em $fasttrackTemp\backup.zip."
}

$env:EAS_NO_VCS = "1"
$env:EAS_PROJECT_ROOT = $fasttrackRoot
Set-Location -LiteralPath $fasttrackMobile
Write-Host "Fontes atualizadas. Gerando o APK atualizado no Expo. Mantenha o Pixel 6 aberto."
Write-Host "Quando perguntar se deseja instalar no emulador, responda Y."
npx.cmd eas-cli@27.5.0 build --platform android --profile preview
if ($LASTEXITCODE -ne 0) {
    throw "O Expo interrompeu a compilacao. A copia anterior dos fontes esta em $fasttrackTemp\backup.zip."
}
