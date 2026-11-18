[CmdletBinding()]
param([switch]$Deploy)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ProductionRef = 'sbomjhwmjmqteybsegdl'
$StagingRef = $env:SHIAP_STAGING_SUPABASE_PROJECT_REF
$StagingUrl = $env:SHIAP_STAGING_URL
$SshAlias = $env:SHIAP_STAGING_SSH_ALIAS
$AppRoot = $env:SHIAP_STAGING_APP_ROOT
$PassengerConfig = $env:SHIAP_STAGING_PASSENGER_CONFIG
$NodePath = $env:SHIAP_STAGING_NODE24
$BasicAuthUser = $env:SHIAP_STAGING_BASIC_AUTH_USER
$BasicAuthPassword = $env:SHIAP_STAGING_BASIC_AUTH_PASSWORD

function Require-Setting([string]$Name, [string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { throw "Missing required staging setting: $Name" }
}

function Invoke-RemoteScript([string]$ScriptText) {
  $ssh = (Get-Command ssh.exe -ErrorAction Stop).Source
  $info = [System.Diagnostics.ProcessStartInfo]::new()
  $info.FileName = $ssh
  $info.Arguments = '-o BatchMode=yes -o ConnectTimeout=12 ' + $SshAlias + ' "bash -s"'
  $info.WorkingDirectory = $RepoRoot
  $info.UseShellExecute = $false
  $info.RedirectStandardInput = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $process = [System.Diagnostics.Process]::Start($info)
  $outTask = $process.StandardOutput.ReadToEndAsync()
  $errTask = $process.StandardError.ReadToEndAsync()
  $process.StandardInput.Write($ScriptText.Replace("`r`n", "`n"))
  $process.StandardInput.Close()
  $process.WaitForExit()
  $out = $outTask.GetAwaiter().GetResult()
  $err = $errTask.GetAwaiter().GetResult()
  if ($process.ExitCode -ne 0) { throw "Staging SSH action failed (exit $($process.ExitCode)): $(($err + $out).Trim())" }
  return $out.Trim()
}

function Invoke-StagingHealth {
  $token = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${BasicAuthUser}:${BasicAuthPassword}"))
  try {
    Invoke-WebRequest -Uri $StagingUrl -TimeoutSec 20 -UseBasicParsing | Out-Null
    throw 'Staging endpoint is publicly accessible without Basic Authentication.'
  } catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -notin @(401, 403)) { throw 'Staging Basic Authentication protection did not return 401/403.' }
    if (-not $_.Exception.Response) { throw }
  }
  $response = Invoke-WebRequest -Uri $StagingUrl -Headers @{ Authorization = "Basic $token" } -TimeoutSec 30 -UseBasicParsing
  if ([int]$response.StatusCode -lt 200 -or [int]$response.StatusCode -ge 300) { throw 'Authenticated staging homepage health check failed.' }
  $robots = $response.Headers['X-Robots-Tag']
  if (-not $robots -or $robots -notmatch 'noindex') { throw 'Staging X-Robots-Tag noindex header is missing.' }
}

Require-Setting 'SHIAP_STAGING_SUPABASE_PROJECT_REF' $StagingRef
Require-Setting 'SHIAP_STAGING_URL' $StagingUrl
Require-Setting 'SHIAP_STAGING_SSH_ALIAS' $SshAlias
Require-Setting 'SHIAP_STAGING_APP_ROOT' $AppRoot
Require-Setting 'SHIAP_STAGING_PASSENGER_CONFIG' $PassengerConfig
Require-Setting 'SHIAP_STAGING_NODE24' $NodePath
Require-Setting 'SHIAP_STAGING_BASIC_AUTH_USER' $BasicAuthUser
Require-Setting 'SHIAP_STAGING_BASIC_AUTH_PASSWORD' $BasicAuthPassword

if ($StagingRef -notmatch '^[a-z0-9]{20}$' -or $StagingRef -eq $ProductionRef) { throw 'Staging Supabase ref is invalid or points to production.' }
if ($StagingUrl -ne 'https://staging.shiap.id') { throw 'Staging URL must be https://staging.shiap.id.' }
if ($SshAlias -notmatch '^[A-Za-z0-9._-]+$' -or $AppRoot -notmatch '^/[A-Za-z0-9/_-]+$' -or $PassengerConfig -notmatch '^/[A-Za-z0-9/._-]+$' -or $NodePath -notmatch '^/[A-Za-z0-9/._-]+$') { throw 'Unsafe staging SSH or path configuration.' }

Set-Location $RepoRoot
$branch = (& git branch --show-current).Trim()
if ($branch -ne 'develop') { throw 'Staging releases must be built from the develop branch.' }
$sha = (& git rev-parse HEAD).Trim()
$ci = $null
if ($Deploy) {
  if (@(& git status --porcelain).Count -gt 0) { throw 'Staging deployment requires a clean working tree.' }
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI is required to verify CI before staging deployment.' }
  $runsJson = & gh run list --repo shiapid/shiap-app --branch develop --commit $sha --limit 20 --json databaseId,headSha,status,conclusion 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Could not verify GitHub Actions status for this staging commit.' }
  $runs = ($runsJson -join "`n") | ConvertFrom-Json
  $ci = $runs | Where-Object { $_.headSha -eq $sha -and $_.status -eq 'completed' -and $_.conclusion -eq 'success' } | Select-Object -First 1
  if (-not $ci) { throw 'Staging deployment requires successful GitHub Actions CI for this exact develop commit.' }
}
& npm.cmd run lint
if ($LASTEXITCODE -ne 0) { throw 'Lint failed.' }
& (Join-Path $RepoRoot 'node_modules\.bin\tsc.cmd') --noEmit
if ($LASTEXITCODE -ne 0) { throw 'TypeScript check failed.' }
& npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'Unit tests failed.' }

# The project ref is checked before asking the Supabase CLI for public key metadata.
$supabaseDbPassword = $env:SUPABASE_DB_PASSWORD
if ([string]::IsNullOrWhiteSpace($supabaseDbPassword)) { throw 'Set SUPABASE_DB_PASSWORD for the staging database before running this script.' }
$oldTelemetry = $env:SUPABASE_TELEMETRY_DISABLED
$env:SUPABASE_TELEMETRY_DISABLED = '1'
$projectRefFile = Join-Path $RepoRoot 'supabase\.temp\project-ref'
$hadProjectRefFile = Test-Path -LiteralPath $projectRefFile
$oldProjectRefFile = if ($hadProjectRefFile) { Get-Content -LiteralPath $projectRefFile -Raw } else { $null }
$cli = Join-Path $RepoRoot 'node_modules\.bin\supabase.cmd'
$env:SUPABASE_DB_PASSWORD = $supabaseDbPassword
try {
  $linkOutput = & $cli link --project-ref $StagingRef 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'Could not link Supabase CLI to the staging project. Check staging access and database password.' }
  $migrationPreview = & $cli db push --remote=$StagingRef --include-all --include-seed --dry-run 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'Staging migration dry-run failed. No migration was applied.' }
  Write-Output 'STAGING_MIGRATION_DRY_RUN_OK (migration details omitted from console)'
  $keyJson = & $cli projects api-keys --project-ref $StagingRef --output-format json 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Supabase CLI could not access the configured staging project.' }
  $keyDoc = ($keyJson -join "`n") | ConvertFrom-Json
  $keyRows = if ($keyDoc -is [array]) { $keyDoc } elseif ($keyDoc.keys) { $keyDoc.keys } else { $keyDoc.data }
  $pub = $keyRows | Where-Object { $_.type -eq 'publishable' } | Select-Object -First 1
  if (-not $pub -or -not $pub.api_key.StartsWith('sb_publishable_')) { throw 'Staging publishable key metadata is missing or invalid.' }
} catch {
  if ($hadProjectRefFile) { [IO.File]::WriteAllText($projectRefFile, $oldProjectRefFile, [Text.UTF8Encoding]::new($false)) }
  elseif (Test-Path -LiteralPath $projectRefFile) { Remove-Item -LiteralPath $projectRefFile -Force }
  if ($null -eq $oldTelemetry) { Remove-Item Env:\SUPABASE_TELEMETRY_DISABLED -ErrorAction SilentlyContinue } else { $env:SUPABASE_TELEMETRY_DISABLED = $oldTelemetry }
  if ($null -eq $supabaseDbPassword) { Remove-Item Env:\SUPABASE_DB_PASSWORD -ErrorAction SilentlyContinue } else { $env:SUPABASE_DB_PASSWORD = $supabaseDbPassword }
  throw
}

$releaseId = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$old = @{
  SHIAP_RELEASE_ENVIRONMENT=$env:SHIAP_RELEASE_ENVIRONMENT
  SHIAP_RELEASE_SUPABASE_URL=$env:SHIAP_RELEASE_SUPABASE_URL
  SHIAP_RELEASE_SUPABASE_PUBLISHABLE_KEY=$env:SHIAP_RELEASE_SUPABASE_PUBLISHABLE_KEY
  SHIAP_EXPECTED_SUPABASE_PROJECT_REF=$env:SHIAP_EXPECTED_SUPABASE_PROJECT_REF
  SHIAP_RELEASE_FILENAME=$env:SHIAP_RELEASE_FILENAME
  SHIAP_RELEASE_DEMO_MODE=$env:SHIAP_RELEASE_DEMO_MODE
}
try {
  $env:SHIAP_RELEASE_ENVIRONMENT = 'staging'
  $env:SHIAP_RELEASE_SUPABASE_URL = "https://$StagingRef.supabase.co"
  $env:SHIAP_RELEASE_SUPABASE_PUBLISHABLE_KEY = $pub.api_key
  $env:SHIAP_EXPECTED_SUPABASE_PROJECT_REF = $StagingRef
  $env:SHIAP_RELEASE_FILENAME = "SHIAP-STAGING-RELEASE-$releaseId.zip"
  $env:SHIAP_RELEASE_DEMO_MODE = 'true'
  & node (Join-Path $RepoRoot 'scripts/build-cpanel-release.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Staging standalone build or Linux smoke test failed.' }
  $zip = Join-Path $RepoRoot "deployment/cpanel/$($env:SHIAP_RELEASE_FILENAME)"
  if (-not (Test-Path -LiteralPath $zip)) { throw 'Staging release archive was not created.' }
  if (-not $Deploy) {
    Write-Output "STAGING_BUILD_READY release=$releaseId artifact=$([IO.Path]::GetFileName($zip))"
    Write-Output 'No remote upload, database migration, DNS change, or cPanel change was performed.'
    return
  }
  $remote = @"
set -euo pipefail
APP_ROOT='$AppRoot'
CONFIG='$PassengerConfig'
NODE24='$NodePath'
ID='$releaseId'
[[ -d `"`$APP_ROOT`" && -f `"`$CONFIG`" && -x `"`$NODE24`" ]]
grep -Fqx 'PassengerAppRoot "`$APP_ROOT"' `"`$CONFIG`"
grep -Fqx 'PassengerBaseURI "/"' `"`$CONFIG`"
grep -Fqx 'PassengerNodejs "`$NODE24"' `"`$CONFIG`"
grep -Fqx 'PassengerAppType node' `"`$CONFIG`"
grep -Fqx 'PassengerStartupFile app.js' `"`$CONFIG`"
[[ `"`$(`"`$NODE24`" --version)`" == v24.* ]]
mkdir -p `"`$APP_ROOT/releases`" `"`$APP_ROOT/tmp`" `"`$APP_ROOT/.shiap-staging-deploy`" `"`$HOME/.shiap-staging-backups/`$ID`"
chmod 700 `"`$APP_ROOT/.shiap-staging-deploy`" `"`$HOME/.shiap-staging-backups`" `"`$HOME/.shiap-staging-backups/`$ID`"
[[ ! -e `"`$APP_ROOT/releases/`$ID`" && ! -e `"`$APP_ROOT/.shiap-staging-deploy/`$ID.zip`" ]]
if [[ -L `"`$APP_ROOT/releases/current`" ]]; then readlink `"`$APP_ROOT/releases/current`" > `"`$HOME/.shiap-staging-backups/`$ID/previous-current`"; else printf '__NONE__\n' > `"`$HOME/.shiap-staging-backups/`$ID/previous-current`"; fi
if [[ -f `"`$APP_ROOT/app.js`" ]]; then cp -p `"`$APP_ROOT/app.js`" `"`$HOME/.shiap-staging-backups/`$ID/previous-app.js`"; else touch `"`$HOME/.shiap-staging-backups/`$ID/no-previous-app`"; fi
cp -p `"`$APP_ROOT/.htaccess`" `"`$HOME/.shiap-staging-backups/`$ID/previous-htaccess`" 2>/dev/null || true
printf 'REMOTE_PREFLIGHT_BACKUP_OK\n'
"@
  Write-Output (Invoke-RemoteScript $remote)

  $migrationOutput = & $cli db push --remote=$StagingRef --include-all --include-seed --yes 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'Staging migration/seed application failed. Review staging database state before retrying.' }
  Write-Output 'STAGING_MIGRATIONS_AND_IDEMPOTENT_DEMO_SEED_APPLIED'

  $remoteZip = "$AppRoot/.shiap-staging-deploy/$releaseId.zip"
  $scp = (Get-Command scp.exe -ErrorAction Stop).Source
  & $scp -q -- $zip "${SshAlias}:$remoteZip"
  if ($LASTEXITCODE -ne 0) { throw 'Staging SFTP upload failed.' }
  $hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
  $activate = @"
set -euo pipefail
APP_ROOT='$AppRoot'; ID='$releaseId'; HOME_BACKUP=`"`$HOME/.shiap-staging-backups/`$ID`"; ZIP=`"`$APP_ROOT/.shiap-staging-deploy/`$ID.zip`"; STAGE=`"`$APP_ROOT/releases/.stage-`$ID`"; TARGET=`"`$APP_ROOT/releases/`$ID`"
[[ -f `"`$ZIP`" && `"`$(sha256sum `"`$ZIP`" | awk '{print `$1}')`" == '$hash' ]]
unzip -tq `"`$ZIP`" >/dev/null
mkdir `"`$STAGE`"; unzip -q `"`$ZIP`" -d `"`$STAGE`"
for f in app.js server.js package.json; do [[ -f `"`$STAGE/`$f`" ]]; done
[[ -d `"`$STAGE/.next/static`" && -f `"`$STAGE/.next/BUILD_ID`" ]]
mv `"`$STAGE`" `"`$TARGET`"
ln -s `"`$ID`" `"`$APP_ROOT/releases/.current-`$ID`"; mv -Tf `"`$APP_ROOT/releases/.current-`$ID`" `"`$APP_ROOT/releases/current`"
printf '%s\n' "process.env.NODE_ENV='production'; process.env.HOSTNAME ||= '0.0.0.0'; require('./releases/current/app.js');" > `"`$APP_ROOT/.app.js-`$ID`"
mv -f `"`$APP_ROOT/.app.js-`$ID`" `"`$APP_ROOT/app.js`"
touch `"`$APP_ROOT/tmp/restart.txt`"
printf 'STAGING_SWITCHED %s\n' '`$ID'
"@
  try {
    Write-Output (Invoke-RemoteScript $activate)
    Invoke-StagingHealth
    $manifestDir = Join-Path $RepoRoot 'deployment/staging'
    New-Item -ItemType Directory -Path $manifestDir -Force | Out-Null
    $manifest = [ordered]@{
      environment='staging'; status='passed'; commit=$sha; branch='develop'; stagingProjectRef=$StagingRef
      url=$StagingUrl; release=$releaseId; artifactSha256=$hash; ciRunId=[string]$ci.databaseId
      checks=@('lint','typescript','unit-tests','linux-standalone-build','authenticated-homepage','basic-auth-protection','noindex-header')
      validatedAtUtc=[DateTime]::UtcNow.ToString('o')
    }
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $manifestDir 'last-validated.json') -Encoding UTF8
    Write-Output "STAGING_DEPLOY_SUCCESS release=$releaseId commit=$sha"
  } catch {
    $rollback = @"
set -euo pipefail
APP_ROOT='$AppRoot'; ID='$releaseId'; BACKUP=`"`$HOME/.shiap-staging-backups/`$ID`"; OLD=`$(cat `"`$BACKUP/previous-current`")
if [[ `"`$OLD`" == '__NONE__' ]]; then rm -f `"`$APP_ROOT/releases/current`"; else [[ `"`$OLD`" =~ ^[A-Za-z0-9._-]+`$ ]]; ln -sfn `"`$OLD`" `"`$APP_ROOT/releases/.rollback-`$ID`"; mv -Tf `"`$APP_ROOT/releases/.rollback-`$ID`" `"`$APP_ROOT/releases/current`"; fi
if [[ -f `"`$BACKUP/previous-app.js`" ]]; then cp -p `"`$BACKUP/previous-app.js`" `"`$APP_ROOT/.app-rollback-`$ID`"; mv -f `"`$APP_ROOT/.app-rollback-`$ID`" `"`$APP_ROOT/app.js`"; else rm -f `"`$APP_ROOT/app.js`"; fi
touch `"`$APP_ROOT/tmp/restart.txt`"; echo 'STAGING_ROLLBACK_RESTARTED'
"@
    try { Write-Output (Invoke-RemoteScript $rollback) } catch { Write-Warning 'Automatic staging rollback also failed; check Passenger error log.' }
    throw
  }
} finally {
  foreach ($name in $old.Keys) {
    if ($null -eq $old[$name]) { Remove-Item "Env:\$name" -ErrorAction SilentlyContinue }
    else { Set-Item "Env:\$name" $old[$name] }
  }
  if ($hadProjectRefFile) { [IO.File]::WriteAllText($projectRefFile, $oldProjectRefFile, [Text.UTF8Encoding]::new($false)) }
  elseif (Test-Path -LiteralPath $projectRefFile) { Remove-Item -LiteralPath $projectRefFile -Force }
  if ($null -eq $oldTelemetry) { Remove-Item Env:\SUPABASE_TELEMETRY_DISABLED -ErrorAction SilentlyContinue } else { $env:SUPABASE_TELEMETRY_DISABLED = $oldTelemetry }
  if ($null -eq $supabaseDbPassword) { Remove-Item Env:\SUPABASE_DB_PASSWORD -ErrorAction SilentlyContinue } else { $env:SUPABASE_DB_PASSWORD = $supabaseDbPassword }
}
