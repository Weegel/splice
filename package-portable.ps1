$ErrorActionPreference = 'Stop'
$release = Join-Path $PWD 'portable-release'
$archive = Join-Path $PWD 'splinterlands-pve-studio-portable.zip'

Write-Host 'Building application...'
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Application build failed.' }

if (Test-Path $release) { Remove-Item $release -Recurse -Force }
if (Test-Path $archive) { Remove-Item $archive -Force }
New-Item -ItemType Directory -Path $release | Out-Null

Copy-Item 'dist' (Join-Path $release 'dist') -Recurse
Copy-Item 'docs' (Join-Path $release 'docs') -Recurse
$localRelease = Join-Path $release 'local'
New-Item -ItemType Directory -Path $localRelease | Out-Null
foreach ($folder in @('cards', 'battles', 'campaigns')) {
	Copy-Item (Join-Path 'local' $folder) $localRelease -Recurse
}
Copy-Item 'local\all_cards.json' (Join-Path $release 'local\all_cards.json')
foreach ($file in @('profiles.json', 'campaign_runs.json')) {
	Remove-Item (Join-Path $localRelease $file) -Force -ErrorAction SilentlyContinue
}
@'
# Local Workspace

Custom cards, battles, and campaigns from the source workspace are included here. Player profiles and progress are not bundled. Your changes and profiles are saved here while using this copy of the editor.
'@ | Set-Content (Join-Path $release 'local\README.md')
Copy-Item 'server.mjs' $release
Copy-Item 'launch-portable.cmd' (Join-Path $release 'launch.cmd')

@'
# Splinterlands PvE Studio

Double-click `launch.cmd` to start the editor. On first launch, it downloads a private Node.js runtime automatically. No Node.js installation, npm, or source code is required.

Custom cards, battles, and campaigns from the source workspace are included in the `local` folder next to the launcher. Player profiles and progress are not bundled.

See `docs/campaign-editor-guide.md` for the editor introduction and first-campaign tutorial. See `docs/ai-campaign-authoring.md` for campaign JSON authoring instructions.
'@ | Set-Content (Join-Path $release 'README.md')

Compress-Archive -Path (Join-Path $release '*') -DestinationPath $archive
Write-Host "Created $archive"
