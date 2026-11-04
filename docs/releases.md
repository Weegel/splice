# GitHub Releases

## Create a Release

The Build Release workflow builds Windows portable and Linux x64 packages from a
version tag, generates SHA-256 checksums, attests the assets, and creates a draft
GitHub Release. It does not publish the release automatically.

1. Commit and push the release workflow and the source changes you want to ship.
   Ensure `package-lock.json`, packaging scripts, and `docs/` are tracked.
   Only commit custom content under `local/cards/`, `local/battles/`, and
   `local/campaigns/` if you intend to distribute it publicly.
2. From the commit you want to release, create and push a new tag:

   ```powershell
   git tag -a v0.1.0 -m "Release v0.1.0"
   git push origin v0.1.0
   ```

3. Open the repository's **Actions** tab and watch **Build Release**.
4. When it succeeds, open **Releases**, edit the new draft, download and test both
   packages, review the generated notes, and select **Publish release**.
   Mark beta releases as pre-releases before publishing.

Use a fresh tag for each release, for example `v0.1.1` or `v0.2.0-beta.1`. Do not
move published tags. Merely pushing source changes does not create a release.
Keep the application version in `package.json` and the lockfile aligned with the
release version when preparing a release.

## Contents and Privacy

Packages include the built app, launch scripts, server, documentation, and local
cards, battles, and campaigns from the tagged source. Review that content before
tagging. Packaging excludes player profiles and campaign progress.

If the tagged source has no local content folders, CI creates empty ones. If
`local/all_cards.json` is absent, CI downloads the current catalog from the
official Splinterlands API. That catalog is build-time external data, not a
version-pinned source input. Commit an approved catalog snapshot if you need to
pin that input. Untracked local files on your computer are never included in a
GitHub Actions build.

The launchers download a private Node.js runtime on first launch. That runtime is
not bundled in, or covered by the attestation of, the release archive.

## Verify Downloads

Compare a downloaded archive's SHA-256 hash with its entry in `SHA256SUMS.txt`:

```powershell
Get-FileHash ./splinterlands-pve-studio-v0.1.0-windows-portable.zip -Algorithm SHA256
```

On Linux, with the checksum file and archives in the same directory:

```bash
sha256sum --check SHA256SUMS.txt
```

With GitHub CLI installed and authenticated, verify build provenance against the
actual repository (replace `OWNER/REPOSITORY`):

```powershell
gh attestation verify ./splinterlands-pve-studio-v0.1.0-windows-portable.zip --repo OWNER/REPOSITORY
```

Checksums detect file changes. Attestations link files to a GitHub Actions build
and source commit; neither is a security review or Windows publisher signature.
These packages remain unsigned, and Windows may still show security warnings.

## Repository Requirements

- Enable GitHub Actions and allow the actions used by the release workflow.
- Public repositories support artifact attestations. Private repositories need
  a GitHub plan that supports them; review GitHub's current plan restrictions.
- The workflow uses the built-in `GITHUB_TOKEN`. No personal token or signing
  certificate is required. Repository or organization policies must allow its
  release and attestation permissions.
- A failed workflow does not automatically retry on another push to the same
  tag. Use **Re-run failed jobs** in Actions after resolving the cause. If a draft
  already exists, inspect it before rerunning the release-creation step.