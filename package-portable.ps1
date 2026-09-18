$ErrorActionPreference = 'Stop'
$release = Join-Path $PWD 'portable-release'
$archive = Join-Path $PWD 'splinterlands-pve-studio-portable.zip'

Write-Host 'Building application...'
npm run build

if (Test-Path $release) { Remove-Item $release -Recurse -Force }
if (Test-Path $archive) { Remove-Item $archive -Force }
New-Item -ItemType Directory -Path $release | Out-Null

Copy-Item 'dist' (Join-Path $release 'dist') -Recurse
New-Item -ItemType Directory -Path (Join-Path $release 'local\cards') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $release 'local\battles') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $release 'local\campaigns') -Force | Out-Null
@'
# Local Workspace

Your cards, battles, campaigns, and profiles are saved here while using this copy of the editor.
'@ | Set-Content (Join-Path $release 'local\README.md')
Copy-Item 'server.mjs' $release
Copy-Item 'launch-portable.cmd' (Join-Path $release 'launch.cmd')

@'
# Splinterlands PvE Studio

Double-click `launch.cmd` to start the editor. On first launch, it downloads a private Node.js runtime automatically. No Node.js installation, npm, or source code is required.

Local cards, battles, and campaigns are stored in the `local` folder next to the launcher.
'@ | Set-Content (Join-Path $release 'README.md')

Compress-Archive -Path (Join-Path $release '*') -DestinationPath $archive
Write-Host "Created $archive"
