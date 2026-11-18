[CmdletBinding()]
param(
  # Deployment is intentionally opt-in. The default run builds, tests, backs up,
  # rehearses SFTP/rollback in an isolated directory, and leaves the live app alone.
  [switch]$Deploy,
  [switch]$FastRelease,
  # Allow a phased release only when remote pending migrations match this exact reviewed set.
  [string[]]$ExpectedPendingMigrations = @(),
  # Live bank-transfer checkout is opt-in and only included in a deployed release.
  [switch]$EnableLivePayments
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

if ($EnableLivePayments -and -not $Deploy) {
  throw 'EnableLivePayments requires -Deploy; dry-run releases must remain in demo mode.'
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$SshAlias = 'shiap-production'
$AppRoot = '/home/shiapsit/shiap-app'
$PassengerConfig = '/home/shiapsit/app.shiap.id/.htaccess'
$Node24 = '/home/shiapsit/nodevenv/shiap-app/24/bin/node'
$ProductionUrl = 'https://app.shiap.id'
$ProjectRef = 'sbomjhwmjmqteybsegdl'
$ProjectUrl = "https://$ProjectRef.supabase.co"
$RemoteScript = @'
#!/usr/bin/env bash
set -euo pipefail

APP_ROOT='/home/shiapsit/shiap-app'
APP_CONFIG='/home/shiapsit/app.shiap.id/.htaccess'
NODE24='/home/shiapsit/nodevenv/shiap-app/24/bin/node'
BACKUP_ROOT='/home/shiapsit/shiap-app-backups'
DEPLOY_ROOT='/home/shiapsit/.shiap-deploy'
MODE="${1:-}"
ID="${2:-}"

validate_id() {
  [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{1,80}$ ]] || { echo 'Invalid release identifier.' >&2; exit 2; }
}

check_app_target() {
  [[ "$(realpath "$APP_ROOT")" == "$APP_ROOT" ]] || { echo 'Application root resolved unexpectedly.' >&2; exit 3; }
  [[ -d "$APP_ROOT" && -f "$APP_CONFIG" ]] || { echo 'SHIAP Passenger root/config not found.' >&2; exit 3; }
  grep -Fqx 'PassengerAppRoot "/home/shiapsit/shiap-app"' "$APP_CONFIG" || { echo 'PassengerAppRoot mismatch.' >&2; exit 3; }
  grep -Fqx 'PassengerBaseURI "/"' "$APP_CONFIG" || { echo 'PassengerBaseURI mismatch.' >&2; exit 3; }
  grep -Fqx 'PassengerNodejs "/home/shiapsit/nodevenv/shiap-app/24/bin/node"' "$APP_CONFIG" || { echo 'PassengerNodejs mismatch.' >&2; exit 3; }
  grep -Fqx 'PassengerAppType node' "$APP_CONFIG" || { echo 'PassengerAppType mismatch.' >&2; exit 3; }
  grep -Fqx 'PassengerStartupFile app.js' "$APP_CONFIG" || { echo 'PassengerStartupFile mismatch.' >&2; exit 3; }
  [[ -x "$NODE24" ]] || { echo 'Configured Node 24 runtime is unavailable.' >&2; exit 3; }
  [[ "$("$NODE24" --version)" == v24.* ]] || { echo 'Configured Passenger runtime is not Node 24.' >&2; exit 3; }
  for item in app.js server.js package.json .next/BUILD_ID public tmp; do
    [[ -e "$APP_ROOT/$item" ]] || { echo "Current runtime missing: $item" >&2; exit 3; }
  done
  command -v tar >/dev/null
  command -v unzip >/dev/null
  command -v sha256sum >/dev/null
}

restore_release() {
  local id="$1" backup="$BACKUP_ROOT/$1" previous
  [[ -f "$backup/previous-current" && -f "$backup/previous-app.js" ]] || { echo 'Rollback state or startup backup missing.' >&2; return 4; }
  previous="$(cat "$backup/previous-current")"
  if [[ "$previous" == '__DIRECT__' ]]; then
    if [[ -L "$APP_ROOT/releases/current" ]]; then rm -f -- "$APP_ROOT/releases/current"; fi
  else
    [[ "$previous" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{1,80}$ ]] || { echo 'Unsafe saved release pointer.' >&2; return 4; }
    [[ -d "$APP_ROOT/releases/$previous" ]] || { echo 'Previous release directory is missing.' >&2; return 4; }
    ln -sfn -- "$previous" "$APP_ROOT/releases/.rollback-$id"
    mv -Tf -- "$APP_ROOT/releases/.rollback-$id" "$APP_ROOT/releases/current"
  fi
  cp -p -- "$backup/previous-app.js" "$APP_ROOT/.app.js.rollback-$id"
  mv -f -- "$APP_ROOT/.app.js.rollback-$id" "$APP_ROOT/app.js"
  touch "$APP_ROOT/tmp/restart.txt"
  echo 'ROLLBACK_RESTART_REQUESTED'
}

case "$MODE" in
  preflight)
    check_app_target
    [[ -w /home/shiapsit ]] || { echo 'Home directory is not writable for a protected deployment staging folder.' >&2; exit 3; }
    printf 'PREFLIGHT_OK root=%s passenger=node24 startup=app.js node=%s\n' "$APP_ROOT" "$("$NODE24" --version)"
    printf 'DISK_FREE_MB=%s\n' "$(df -Pm "$APP_ROOT" | awk 'NR==2 {print $4}')"
    ;;

  backup)
    validate_id "$ID"
    check_app_target
    backup="$BACKUP_ROOT/$ID"
    mkdir -p -- "$backup"
    chmod 700 "$BACKUP_ROOT" "$backup"
    if [[ -e "$backup/current-runtime.tar.gz" ]]; then echo 'Backup path already exists; refusing to overwrite.' >&2; exit 4; fi
    cp -p -- "$APP_ROOT/app.js" "$backup/previous-app.js"
    if [[ -L "$APP_ROOT/releases/current" ]]; then
      previous="$(readlink "$APP_ROOT/releases/current")"
      [[ "$previous" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{1,80}$ ]] || { echo 'Current release pointer is unsafe.' >&2; exit 4; }
      printf '%s\n' "$previous" > "$backup/previous-current"
      tar -czf "$backup/current-runtime.tar.gz" -C "$APP_ROOT" app.js releases/current
    else
      printf '__DIRECT__\n' > "$backup/previous-current"
      tar -czf "$backup/current-runtime.tar.gz" -C "$APP_ROOT" app.js server.js package.json .next public
    fi
    chmod 600 "$backup/previous-app.js" "$backup/previous-current" "$backup/current-runtime.tar.gz"
    tar -tzf "$backup/current-runtime.tar.gz" >/dev/null
    printf 'BACKUP_OK path=%s archive_bytes=%s\n' "$backup/current-runtime.tar.gz" "$(stat -c %s "$backup/current-runtime.tar.gz")"
    ;;

  prepare-upload)
    validate_id "$ID"
    check_app_target
    mkdir -p -- "$DEPLOY_ROOT"
    chmod 700 "$DEPLOY_ROOT"
    [[ ! -e "$DEPLOY_ROOT/$ID.zip" ]] || { echo 'Upload path already exists.' >&2; exit 5; }
    echo 'UPLOAD_PATH_READY'
    ;;

  verify-upload)
    validate_id "$ID"
    expected_sha="${3:-}"
    [[ "$expected_sha" =~ ^[a-fA-F0-9]{64}$ ]] || { echo 'Invalid expected archive checksum.' >&2; exit 5; }
    file="$DEPLOY_ROOT/$ID.zip"
    [[ -f "$file" ]] || { echo 'Uploaded release ZIP is missing.' >&2; exit 5; }
    actual_sha="$(sha256sum "$file" | awk '{print $1}')"
    [[ "$actual_sha" == "$expected_sha" ]] || { echo 'Uploaded ZIP checksum does not match.' >&2; exit 5; }
    unzip -tq "$file" >/dev/null
    if unzip -Z1 "$file" | grep -Eq '(^/|(^|/)\.\.(/|$)|(^|/)\.env([^/]*$|/)|(^|/)\.git(/|$)'; then
      echo 'Uploaded archive contains a forbidden path.' >&2; exit 5
    fi
    printf 'UPLOAD_OK bytes=%s checksum=match\n' "$(stat -c %s "$file")"
    ;;

  simulate)
    validate_id "$ID"
    testroot="$DEPLOY_ROOT/dryrun-$ID"
    [[ ! -e "$testroot" ]] || { echo 'Dry-run path already exists.' >&2; exit 6; }
    mkdir -p "$testroot/releases/r-old" "$testroot/releases/r-new" "$testroot/tmp"
    printf 'old\n' > "$testroot/releases/r-old/marker"
    printf 'new\n' > "$testroot/releases/r-new/marker"
    printf 'old passenger loader\n' > "$testroot/app.js"
    cp -p "$testroot/app.js" "$testroot/previous-app.js"
    ln -s r-old "$testroot/releases/current"
    ln -sfn r-new "$testroot/releases/.current-next"
    mv -Tf "$testroot/releases/.current-next" "$testroot/releases/current"
    [[ "$(cat "$testroot/releases/current/marker")" == new ]]
    printf 'new passenger loader\n' > "$testroot/app.js"
    ln -sfn r-old "$testroot/releases/.rollback"
    mv -Tf "$testroot/releases/.rollback" "$testroot/releases/current"
    [[ "$(cat "$testroot/releases/current/marker")" == old ]]
    cp -p "$testroot/previous-app.js" "$testroot/.app.js.rollback"
    mv -f "$testroot/.app.js.rollback" "$testroot/app.js"
    [[ "$(cat "$testroot/app.js")" == 'old passenger loader' ]]
    touch "$testroot/tmp/restart.txt"
    [[ -f "$testroot/tmp/restart.txt" ]]
    echo 'PASSENGER_POINTER_AND_ROLLBACK_SIMULATION_OK'
    ;;

  cleanup-dryrun)
    validate_id "$ID"
    testroot="$DEPLOY_ROOT/dryrun-$ID"
    upload="$DEPLOY_ROOT/$ID.zip"
    [[ "$testroot" == "$DEPLOY_ROOT/dryrun-$ID" && "$upload" == "$DEPLOY_ROOT/$ID.zip" ]] || exit 7
    if [[ -d "$testroot" ]]; then rm -rf -- "$testroot"; fi
    if [[ -f "$upload" ]]; then rm -f -- "$upload"; fi
    echo 'DRYRUN_TEMP_FILES_CLEANED'
    ;;

  deploy)
    validate_id "$ID"
    check_app_target
    upload="$DEPLOY_ROOT/$ID.zip"
    backup="$BACKUP_ROOT/$ID"
    stage="$APP_ROOT/releases/.staging-$ID"
    target="$APP_ROOT/releases/$ID"
    [[ -f "$upload" && -f "$backup/previous-app.js" && -f "$backup/previous-current" ]] || { echo 'Verified upload or backup missing.' >&2; exit 8; }
    [[ ! -e "$stage" && ! -e "$target" ]] || { echo 'Release target exists; refusing to overwrite.' >&2; exit 8; }
    mkdir -p "$APP_ROOT/releases"
    mkdir "$stage"
    unzip -q "$upload" -d "$stage"
    for item in app.js server.js package.json public; do [[ -e "$stage/$item" ]] || { echo "Package missing $item." >&2; exit 8; }; done
    [[ -d "$stage/.next/static" && -f "$stage/.next/BUILD_ID" ]] || { echo 'Package missing Next runtime assets.' >&2; exit 8; }
    mv -- "$stage" "$target"
    ln -s -- "$ID" "$APP_ROOT/releases/.current-$ID"
    mv -Tf -- "$APP_ROOT/releases/.current-$ID" "$APP_ROOT/releases/current"
    cat > "$APP_ROOT/.app.js.next-$ID" <<'APPLOADER'
// Stable cPanel Passenger loader. The active standalone release is selected by
// an atomic symlink update; the old release directory remains available.
process.env.NODE_ENV = 'production';
process.env.HOSTNAME ||= '0.0.0.0';
require('./releases/current/app.js');
APPLOADER
    mv -f -- "$APP_ROOT/.app.js.next-$ID" "$APP_ROOT/app.js"
    touch "$APP_ROOT/tmp/restart.txt"
    printf 'DEPLOY_SWITCHED release=%s\n' "$ID"
    ;;

  rollback)
    validate_id "$ID"
    check_app_target
    restore_release "$ID"
    ;;

  cleanup-upload)
    validate_id "$ID"
    file="$DEPLOY_ROOT/$ID.zip"
    [[ "$file" == "$DEPLOY_ROOT/$ID.zip" ]] || exit 9
    if [[ -f "$file" ]]; then rm -f -- "$file"; fi
    echo 'UPLOAD_ARCHIVE_REMOVED'
    ;;

  *) echo 'Unknown remote operation.' >&2; exit 2 ;;
esac
'@

function Invoke-SshScript {
  param(
    [Parameter(Mandatory)][string[]]$RemoteArguments,
    [Parameter(Mandatory)][string]$ScriptText
  )

  $sshExe = (Get-Command ssh.exe -ErrorAction Stop).Source
  foreach ($argument in $RemoteArguments) {
    if ($argument -notmatch '^[A-Za-z0-9._-]+$') { throw 'Unsafe SSH helper argument.' }
  }
  $remoteCommand = 'bash -s -- ' + ($RemoteArguments -join ' ')
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $sshExe
  $startInfo.WorkingDirectory = $RepoRoot
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  # PowerShell 5.1 runs on .NET Framework, which lacks ProcessStartInfo.ArgumentList.
  # All values below are fixed or validated ASCII arguments; quote the remote
  # command so Windows OpenSSH receives it as a single argument.
  $startInfo.Arguments = '-o BatchMode=yes -o ConnectTimeout=12 ' + $SshAlias + ' "' + $remoteCommand + '"'
  $process = [System.Diagnostics.Process]::Start($startInfo)
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $process.StandardInput.Write($ScriptText.Replace("`r`n", "`n"))
  $process.StandardInput.Close()
  $process.WaitForExit()
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  if ($process.ExitCode -ne 0) {
    $detail = ($stderr + "`n" + $stdout).Trim()
    throw "SSH remote action failed (exit $($process.ExitCode)): $detail"
  }
  return $stdout.Trim()
}

function Test-BookingProductionPreflight {
  # Inspect only this application's Node workers. The helper outputs presence
  # flags and fixed diagnostic codes, never credential values or customer data.
  $helper = Get-Content (Join-Path $RepoRoot 'scripts\check-booking-production.mjs') -Raw
  $script = "set -euo pipefail`n'$Node24' --input-type=module - --inspect-passenger <<'SHIAP_BOOKING_PREFLIGHT'`n" + $helper + "`nSHIAP_BOOKING_PREFLIGHT`n"
  $result = Invoke-SshScript -RemoteArguments @('booking-preflight') -ScriptText $script
  Write-Host $result
  if ($result -notmatch 'BOOKING_PRODUCTION_PREFLIGHT_OK') { throw 'Booking production preflight did not confirm readiness.' }
}

function Invoke-Scp {
  param([Parameter(Mandatory)][string]$LocalPath, [Parameter(Mandatory)][string]$RemotePath)
  $scpExe = (Get-Command scp.exe -ErrorAction Stop).Source
  & $scpExe -q -- $LocalPath "${SshAlias}:$RemotePath"
  if ($LASTEXITCODE -ne 0) { throw "SCP upload failed with exit code $LASTEXITCODE." }
}

function Test-ProductionHealth {
  param([Parameter(Mandatory)][string[]]$Paths)
  foreach ($path in $Paths) {
    $uri = "$ProductionUrl$path"
    try {
      $response = Invoke-WebRequest -Uri $uri -Method Get -TimeoutSec 25 -UseBasicParsing
      if ([int]$response.StatusCode -lt 200 -or [int]$response.StatusCode -ge 300) {
        throw "HTTP $([int]$response.StatusCode)"
      }
      "HEALTH_OK $path HTTP $([int]$response.StatusCode)"
    } catch {
      throw "Production health check failed for $path ($($_.Exception.GetType().Name))."
    }
  }
}

function Invoke-SupabaseMigrationPreview {
  $cliPath = Join-Path $RepoRoot 'node_modules\.bin\supabase.cmd'
  $info = [System.Diagnostics.ProcessStartInfo]::new()
  $info.FileName = $env:ComSpec
  $info.WorkingDirectory = $RepoRoot
  $info.Arguments = '/d /s /c ""' + $cliPath + '" db push --remote=' + $ProjectRef + ' --include-all --dry-run --output-format json"'
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $info
  try {
    [void]$process.Start()
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $preview = $stdout.GetAwaiter().GetResult() + [Environment]::NewLine + $stderr.GetAwaiter().GetResult()
    Write-Host $preview.Trim()
    if ($process.ExitCode -ne 0) {
      throw "Production migration preview failed (CLI exit $($process.ExitCode)). Deployment stopped."
    }
    return ($stdout.GetAwaiter().GetResult() | ConvertFrom-Json)
  } finally {
    $process.Dispose()
  }
}

Set-Location $RepoRoot
Write-Host "SHIAP direct cPanel deployment - $(if ($Deploy) { 'DEPLOY MODE' } else { 'DRY-RUN MODE' })"
Write-Host "Target alias: $SshAlias | application root: $AppRoot | Supabase project: $ProjectRef"

if ($Deploy -and -not $FastRelease) {
  $branch = (& git branch --show-current).Trim()
  if ($branch -ne 'main') { throw 'Production release gate: deploy only from main after staging validation.' }
  $status = @(& git status --porcelain)
  if ($status.Count -gt 0) { throw 'Production release gate: working tree must be clean so the promoted source is auditable.' }
  $commit = (& git rev-parse HEAD).Trim()
  $validationPath = Join-Path $RepoRoot 'deployment/staging/last-validated.json'
  if (-not (Test-Path -LiteralPath $validationPath)) { throw 'Production release gate: no successful staging validation manifest exists.' }
  $validation = Get-Content -LiteralPath $validationPath -Raw | ConvertFrom-Json
  if ($validation.environment -ne 'staging' -or $validation.status -ne 'passed' -or $validation.commit -ne $commit -or $validation.stagingProjectRef -eq $ProjectRef) {
    throw 'Production release gate: staging validation must pass for this exact commit and a separate staging project.'
  }
  if (-not $validation.ciRunId -or -not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'Production release gate: successful GitHub Actions run metadata is required.' }
  $ciJson = & gh run view ([string]$validation.ciRunId) --repo shiapid/shiap-app --json headSha,headBranch,status,conclusion 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Production release gate: could not verify the GitHub Actions run.' }
  $ci = ($ciJson -join "`n") | ConvertFrom-Json
  if ($ci.headSha -ne $commit -or $ci.headBranch -notin @('develop', 'main') -or $ci.status -ne 'completed' -or $ci.conclusion -ne 'success') {
    throw 'Production release gate: CI must have passed for the exact promoted commit.'
  }
  Write-Host "Staging and CI release gates passed for commit $commit."
}

if ($FastRelease) {
  Write-Host 'Fast Release uses the active workspace. Review the following changes to build inputs before approving deployment.'
  & git status --short --untracked-files=all -- src public package.json package-lock.json next.config.ts postcss.config.mjs tsconfig.json proxy.ts
  if ($LASTEXITCODE -ne 0) { throw 'Could not inventory release inputs.' }
}

if ($Deploy -or $FastRelease) {
  $preview = Invoke-SupabaseMigrationPreview
  $expectedPending = @($ExpectedPendingMigrations | Sort-Object -Unique)
  $actualPending = @($preview.migrations | Sort-Object -Unique)
  foreach ($migration in $expectedPending) {
    if ($migration -notmatch '^20\d{12}_[a-z0-9_]+\.sql$') { throw 'ExpectedPendingMigrations must contain exact timestamped migration filenames.' }
  }
  if ($expectedPending.Count -gt 0 -and -not $FastRelease) {
    throw 'ExpectedPendingMigrations is allowed only for Fast Release.'
  }
  $pendingMatches = if ($expectedPending.Count -eq 0) {
    $actualPending.Count -eq 0
  } else {
    $difference = @(Compare-Object -ReferenceObject $expectedPending -DifferenceObject $actualPending -CaseSensitive)
    $difference.Count -eq 0
  }
  $migrationStateMatches = if ($expectedPending.Count -eq 0) { $preview.upToDate -eq $true } else { $preview.upToDate -eq $false }
  if (-not $migrationStateMatches -or -not $pendingMatches -or $preview.dryRun -ne $true -or
      $preview.target.project_ref -ne $ProjectRef -or
      $null -eq $preview.migrations -or
      $null -eq $preview.seeds -or @($preview.seeds).Count -ne 0 -or
      $null -eq $preview.roles -or @($preview.roles).Count -ne 0) {
    throw 'Review the pending SQL and compatibility, prepare a recoverable database backup, and obtain explicit approval before applying migrations. Application rollback does not revert database changes.'
  }
  Write-Host "MIGRATION_PREVIEW_MATCHED pending=$($actualPending.Count) target=$ProjectRef"
}

# Verify SSH agent and host login before spending time on the Linux build.
$sshAdd = (Get-Command ssh-add.exe -ErrorAction Stop).Source
$agentInfo = [System.Diagnostics.ProcessStartInfo]::new()
$agentInfo.FileName = $sshAdd
$agentInfo.Arguments = '-l'
$agentInfo.WorkingDirectory = $RepoRoot
$agentInfo.UseShellExecute = $false
$agentInfo.CreateNoWindow = $true
$agentInfo.RedirectStandardOutput = $true
$agentInfo.RedirectStandardError = $true
$agentProcess = [System.Diagnostics.Process]::new()
$agentProcess.StartInfo = $agentInfo
try {
  [void]$agentProcess.Start()
  $agentStdoutTask = $agentProcess.StandardOutput.ReadToEndAsync()
  $agentStderrTask = $agentProcess.StandardError.ReadToEndAsync()
  $agentProcess.WaitForExit()
  $agentOutput = $agentStdoutTask.GetAwaiter().GetResult()
  [void]$agentStderrTask.GetAwaiter().GetResult()
  if ($agentProcess.ExitCode -ne 0) { throw 'Windows SSH Agent is unavailable or has no loaded identity. Add the configured key to ssh-agent; do not copy the private key.' }
} finally {
  $agentProcess.Dispose()
}
$identityCount = @($agentOutput -split '\r?\n' | Where-Object { $_ -match '^[0-9]+ SHA256:' }).Count
if ($identityCount -lt 1) { throw 'ssh-add -l returned no usable identity.' }
Write-Host "SSH agent identity available: $identityCount"
$sshCheck = Invoke-SshScript -RemoteArguments @('preflight') -ScriptText $RemoteScript
Write-Host $sshCheck

Test-ProductionHealth -Paths @('/')
Test-BookingProductionPreflight

# Quality gates requested for each release.
Write-Host 'Running lint...'
& npm.cmd run lint
if ($LASTEXITCODE -ne 0) { throw 'Lint failed.' }
Write-Host 'Running TypeScript check...'
& (Join-Path $RepoRoot 'node_modules\.bin\tsc.cmd') --noEmit
if ($LASTEXITCODE -ne 0) { throw 'TypeScript check failed.' }
$package = Get-Content (Join-Path $RepoRoot 'package.json') -Raw | ConvertFrom-Json
if ($package.scripts.test) {
  Write-Host 'Running project tests...'
    & npm.cmd test
  if ($LASTEXITCODE -ne 0) { throw 'Project tests failed.' }
} else {
  throw 'The project must define an npm test script before release.'
}

# Read the public key from the official CLI in memory. Never read .env.local,
# print key material, or copy an SSH identity.
$oldTelemetry = $env:SUPABASE_TELEMETRY_DISABLED
$oldBuildUrl = $env:SHIAP_RELEASE_SUPABASE_URL
$oldBuildKey = $env:SHIAP_RELEASE_SUPABASE_PUBLISHABLE_KEY
$oldExpectedRef = $env:SHIAP_EXPECTED_SUPABASE_PROJECT_REF
$oldFilename = $env:SHIAP_RELEASE_FILENAME
$oldDemo = $env:SHIAP_RELEASE_DEMO_MODE
$zipPath = $null
$releaseId = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$remoteId = if ($Deploy) { "shiap-$releaseId" } else { $releaseId }
$remoteZipId = $remoteId
$backupCreated = $false
$deploymentSwitched = $false

try {
  $env:SUPABASE_TELEMETRY_DISABLED = '1'
  $cli = Join-Path $RepoRoot 'node_modules\.bin\supabase.cmd'
  # Windows PowerShell 5.1 may turn benign native STDERR (Supabase CLI status)
  # into a terminating NativeCommandError when ErrorActionPreference is Stop.
  # Capture both streams in memory via cmd.exe, but parse only STDOUT JSON.
  # No API key metadata is written to disk or echoed to the console.
  $cliInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $cliInfo.FileName = if ($env:ComSpec) { $env:ComSpec } else { 'cmd.exe' }
  $cliInfo.WorkingDirectory = $RepoRoot
  $cliInfo.Arguments = '/d /s /c ""' + $cli + '" projects api-keys --remote=' + $ProjectRef + ' --output-format json"'
  $cliInfo.UseShellExecute = $false
  $cliInfo.CreateNoWindow = $true
  $cliInfo.RedirectStandardOutput = $true
  $cliInfo.RedirectStandardError = $true
  $cliProcess = [System.Diagnostics.Process]::new()
  $cliProcess.StartInfo = $cliInfo
  try {
    [void]$cliProcess.Start()
    $cliStdoutTask = $cliProcess.StandardOutput.ReadToEndAsync()
    $cliStderrTask = $cliProcess.StandardError.ReadToEndAsync()
    $cliProcess.WaitForExit()
    $apiKeyOutput = $cliStdoutTask.GetAwaiter().GetResult()
    [void]$cliStderrTask.GetAwaiter().GetResult()
    if ($cliProcess.ExitCode -ne 0) {
      throw "Could not read canonical Supabase public API key metadata (CLI exit $($cliProcess.ExitCode)). Check Supabase CLI authentication and project access."
    }
  } finally {
    $cliProcess.Dispose()
  }
  $keyDocument = $apiKeyOutput | ConvertFrom-Json
  $keyRows = if ($keyDocument -is [array]) { $keyDocument } elseif ($keyDocument.keys) { $keyDocument.keys } else { $keyDocument.data }
  $publishableKey = $keyRows | Where-Object { $_.type -eq 'publishable' } | Select-Object -First 1
  if (-not $publishableKey -or -not $publishableKey.api_key.StartsWith('sb_publishable_')) {
    throw 'Canonical Supabase publishable key metadata is missing or has an unexpected type.'
  }
  $env:SHIAP_RELEASE_SUPABASE_URL = $ProjectUrl
  $env:SHIAP_RELEASE_SUPABASE_PUBLISHABLE_KEY = $publishableKey.api_key
  $env:SHIAP_EXPECTED_SUPABASE_PROJECT_REF = $ProjectRef
  $env:SHIAP_RELEASE_FILENAME = "SHIAP-PRODUCTION-RELEASE-direct-$releaseId.zip"
  $env:SHIAP_RELEASE_DEMO_MODE = if ($EnableLivePayments) { 'false' } else { 'true' }
  $zipPath = Join-Path $RepoRoot "deployment/cpanel/$($env:SHIAP_RELEASE_FILENAME)"

  Write-Host 'Building Linux standalone release on Node 24; local .env files are not read...'
  & node (Join-Path $RepoRoot 'scripts/build-cpanel-release.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Production standalone build or local Passenger smoke test failed.' }
  if (-not (Test-Path -LiteralPath $zipPath)) { throw 'Expected release ZIP was not created.' }
  $zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $zipBytes = (Get-Item -LiteralPath $zipPath).Length
  Write-Host "Release package ready: $([IO.Path]::GetFileName($zipPath)) ($zipBytes bytes)"
  if ($EnableLivePayments) {
    Write-Host 'Live bank-transfer checkout is enabled for this release.'
  } else {
    Write-Host 'Payment demo mode is enabled for this release.'
  }

  # Prepare a verified backup of the live runtime without replacing it.
  $backupId = if ($Deploy) { $remoteId } else { "dryrun-$releaseId" }
  $backupResult = Invoke-SshScript -RemoteArguments @('backup', $backupId) -ScriptText $RemoteScript
  Write-Host $backupResult
  $backupCreated = $true

  $remotePath = "/home/shiapsit/.shiap-deploy/$remoteZipId.zip"
  [void](Invoke-SshScript -RemoteArguments @('prepare-upload', $remoteZipId) -ScriptText $RemoteScript)
  Write-Host 'Uploading release archive to the protected staging directory...'
  Invoke-Scp -LocalPath $zipPath -RemotePath $remotePath
  $uploadResult = Invoke-SshScript -RemoteArguments @('verify-upload', $remoteZipId, $zipHash) -ScriptText $RemoteScript
  Write-Host $uploadResult

  if (-not $Deploy) {
    $simulation = Invoke-SshScript -RemoteArguments @('simulate', $releaseId) -ScriptText $RemoteScript
    Write-Host $simulation
    $cleanup = Invoke-SshScript -RemoteArguments @('cleanup-dryrun', $remoteZipId) -ScriptText $RemoteScript
    Write-Host $cleanup
    Write-Host 'DRY_RUN_SUCCESS: no active symlink, app.js, Passenger restart file, database, or production content was changed.'
    Write-Host "Backup retained outside the app root: /home/shiapsit/shiap-app-backups/$backupId"
    Write-Host 'A production deployment still requires a separate explicit approval and a later run with -Deploy.'
    return
  }

  try {
    Write-Host 'Activating the new release through an atomic current symlink...'
    $deployResult = Invoke-SshScript -RemoteArguments @('deploy', $remoteId) -ScriptText $RemoteScript
    Write-Host $deployResult
    $deploymentSwitched = $true
    Write-Host 'Checking production homepage and service routes...'
    Test-ProductionHealth -Paths @('/', '/explore', '/trip', '/stay', '/rental', '/activities', '/shinema', '/custom-trip', '/booking')
    Test-BookingProductionPreflight
    [void](Invoke-SshScript -RemoteArguments @('cleanup-upload', $remoteId) -ScriptText $RemoteScript)
    Write-Host "DEPLOY_SUCCESS release=$remoteId"
    Write-Host "Rollback backup: /home/shiapsit/shiap-app-backups/$remoteId"
  } catch {
    if ($deploymentSwitched -or $backupCreated) {
      Write-Warning 'Deployment or health check failed; restoring the previous Passenger target.'
      $rollback = Invoke-SshScript -RemoteArguments @('rollback', $remoteId) -ScriptText $RemoteScript
      Write-Host $rollback
      Test-ProductionHealth -Paths @('/')
    }
    throw
  }
} finally {
  foreach ($item in @(
    @{ Name = 'SUPABASE_TELEMETRY_DISABLED'; Value = $oldTelemetry },
    @{ Name = 'SHIAP_RELEASE_SUPABASE_URL'; Value = $oldBuildUrl },
    @{ Name = 'SHIAP_RELEASE_SUPABASE_PUBLISHABLE_KEY'; Value = $oldBuildKey },
    @{ Name = 'SHIAP_EXPECTED_SUPABASE_PROJECT_REF'; Value = $oldExpectedRef },
    @{ Name = 'SHIAP_RELEASE_FILENAME'; Value = $oldFilename },
    @{ Name = 'SHIAP_RELEASE_DEMO_MODE'; Value = $oldDemo }
  )) {
    $varPath = "Env:\$($item.Name)"
    if ($null -eq $item.Value) { Remove-Item $varPath -ErrorAction SilentlyContinue }
    else { Set-Item $varPath $item.Value }
  }
}
