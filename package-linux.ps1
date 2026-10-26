$ErrorActionPreference = 'Stop'
$releaseName = 'splinterlands-pve-studio-linux-x64'
$release = Join-Path $PWD $releaseName
$archive = Join-Path $PWD "$releaseName.tar.gz"

Write-Host 'Building application...'
npm run build

if (Test-Path $release) { Remove-Item $release -Recurse -Force }
if (Test-Path $archive) { Remove-Item $archive -Force }
New-Item -ItemType Directory -Path $release | Out-Null

Copy-Item 'dist' (Join-Path $release 'dist') -Recurse
New-Item -ItemType Directory -Path (Join-Path $release 'local/cards') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $release 'local/battles') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $release 'local/campaigns') -Force | Out-Null
Copy-Item 'local/all_cards.json' (Join-Path $release 'local/all_cards.json')
Copy-Item 'server.mjs' $release
Copy-Item 'launch-linux.sh' (Join-Path $release 'launch.sh')

$readme = @'
# Splinterlands PvE Studio for Linux x64

Run `./launch.sh`. On first launch it downloads and verifies a private Node.js runtime.

For offline setup, place a trusted Linux x64 Node.js binary at `runtime/node`. Local cards, battles, and campaigns are stored in `local/`.
'@
[IO.File]::WriteAllText((Join-Path $release 'README.md'), $readme.Replace("`r`n", "`n"), [Text.UTF8Encoding]::new($false))

$launcherPath = Join-Path $release 'launch.sh'
$launcher = [IO.File]::ReadAllText($launcherPath).Replace("`r`n", "`n")
[IO.File]::WriteAllText($launcherPath, $launcher, [Text.UTF8Encoding]::new($false))

$bash = (Get-Command bash -ErrorAction Stop).Source
$linuxRoot = (& $bash -lc "cygpath -u '$($PWD.Path)'").Trim()
& $bash -lc "cd '$linuxRoot' && chmod 755 '$releaseName/launch.sh' && tar -czf '$releaseName.tar.gz' '$releaseName'"
if ($LASTEXITCODE -ne 0) { throw 'Could not create Linux archive.' }

Write-Host "Created $archive"