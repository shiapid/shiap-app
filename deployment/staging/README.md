# SHIAP Staging Setup

Staging is intentionally separate from `Shiap App` production (`sbomjhwmjmqteybsegdl`). The staging script stops unless its project reference is a different 20-character Supabase ref, the URL is exactly `https://staging.shiap.id`, and the staging SSH/Passenger paths are explicitly configured.

## cPanel prerequisite

Create a second Node.js 24 Passenger application for `staging.shiap.id`, with its own application root, startup file `app.js`, and Passenger config path. Turn on cPanel Directory Privacy / HTTP Basic Authentication for the entire subdomain before publishing it. The script verifies the configured Passenger directives, checks for an unauthenticated 401/403, checks authenticated homepage status, and checks `X-Robots-Tag: noindex`.

## Local PowerShell environment

Set these variables in the current PowerShell session (do not save their values in the repository):

| Variable | Purpose |
| --- | --- |
| `SHIAP_STAGING_SUPABASE_PROJECT_REF` | Dedicated staging project ref, never the production ref |
| `SUPABASE_DB_PASSWORD` | Staging database password used by Supabase CLI |
| `SHIAP_STAGING_URL` | Must be `https://staging.shiap.id` |
| `SHIAP_STAGING_SSH_ALIAS` | SSH config alias for the staging app only |
| `SHIAP_STAGING_APP_ROOT` | Dedicated staging app root |
| `SHIAP_STAGING_PASSENGER_CONFIG` | Staging subdomain Passenger config file |
| `SHIAP_STAGING_NODE24` | Absolute Node 24 executable path for staging |
| `SHIAP_STAGING_BASIC_AUTH_USER` / `SHIAP_STAGING_BASIC_AUTH_PASSWORD` | Staging-only HTTP Basic Auth health check |

Run `scripts/deploy-cpanel-staging.ps1` for a build and migration preview. Run `scripts/deploy-cpanel-staging.ps1 -Deploy` only after reviewing the staging migration preview and confirming the cPanel app and Basic Auth setup. Deployment applies local migrations and the idempotent demo seed to the staging project only, then backs up the current app release, activates the release, checks health, and rolls back the app release on failure. It never targets the production Supabase ref.

The app build forces demo payment mode. `supabase/seed.sql` disables payment settings and contains catalog demo records only. Do not add real customer or payment data to staging.

After successful staging health checks, the script writes an ignored local validation receipt at `deployment/staging/last-validated.json`. Keep this file on the deployment workstation when switching to the same commit on `main`; the production deployment script requires the receipt, matching commit SHA, and a successful GitHub Actions run. The receipt contains no credentials.
