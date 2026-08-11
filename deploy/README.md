# ASAS production deployment

This deployment runs the Next.js application, PostgreSQL 18, and Caddy on one VPS. PostgreSQL is bound only to `127.0.0.1`; Caddy is the only public application entry point and provisions HTTPS for `asas.com` automatically.

## 1. Create the server

Create an Ubuntu 24.04 server with at least 4 GB RAM (8 GB is recommended), an IPv4 address, and provider backups enabled.

Allow these inbound firewall ports:

- `22/tcp` from the administrator's fixed IP where possible.
- `80/tcp` from everywhere.
- `443/tcp` and `443/udp` from everywhere.
- Do not open PostgreSQL port `5432` publicly.

Install Docker Engine, the Docker Compose plugin, `rsync`, and `curl`. Create a non-root deployment user that can run Docker, then create the deployment directories:

```bash
sudo install -d -o deploy -g deploy /opt/asas/app /opt/asas/backups
```

The `deploy` user needs an SSH public key whose private key will be stored in GitHub as `SERVER_SSH_KEY`.

## 2. Create production secrets

On the server, copy `.env.production.example` to `/opt/asas/app/.env.production`, replace every placeholder, and restrict access:

```bash
cd /opt/asas/app
cp .env.production.example .env.production
chmod 600 .env.production
```

Use URL-safe random values for `POSTGRES_PASSWORD` and `CRON_SECRET`. The password in `POSTGRES_PASSWORD` must exactly match the password embedded in `DATABASE_URL`, which must end in `/management`. Company database names are stored only in `management.companies.db_name`.

Never commit `.env.production` to Git.

## 3. Configure DNS

After the first successful deployment, configure the domain provider with the exact public IPv4 address of the server:

| Type | Name | Value |
| --- | --- | --- |
| `A` | `@` | `SERVER_IPV4` |
| `A` | `www` | `SERVER_IPV4` |

Remove conflicting `A`/`AAAA` records for `@` and `www`. Keep MX/TXT email records unchanged. Caddy will request and renew TLS certificates after DNS points to the server and ports 80/443 are reachable.

## 4. Configure automatic deployment

Add these GitHub repository secrets under **Settings → Secrets and variables → Actions**:

- `SERVER_HOST`: server IPv4 address.
- `SERVER_USER`: `deploy`.
- `SERVER_SSH_KEY`: private SSH deployment key.
- `SERVER_KNOWN_HOSTS`: output of `ssh-keyscan -H SERVER_IPV4`, verified against the server fingerprint.

The workflow `.github/workflows/deploy-production.yml` deploys every push to `main`. The repository currently uses `main` as its default branch; it is the production equivalent of `master`.

## 5. First deployment

Push the reviewed production commit to `main`, or start the workflow manually from GitHub Actions. Confirm the containers:

```bash
cd /opt/asas/app
docker compose --env-file .env.production -f compose.production.yml ps
docker compose --env-file .env.production -f compose.production.yml logs --tail=100 app caddy
```

On a new PostgreSQL volume, the container automatically creates `management`, its tables, and `company_template`. The application creates each `co_*` company database from that template when a company is approved. A fresh server does not require an `inventory_system` restore.

If the database container was already started before these bootstrap mounts were added, update `.env.production` and run the bootstrap explicitly:

```bash
docker compose --env-file .env.production -f compose.production.yml exec database bash /bootstrap/scripts/bootstrap-databases.sh
```

For a migration of an existing installation, restore `management` and every existing `co_*` company database. Preserve company database names because tenant selection depends on them. Do not restore `inventory_system` for a fresh installation.

## 6. Connect local pgAdmin securely

Create an SSH tunnel from the local computer:

```bash
ssh -N -L 5433:127.0.0.1:5432 deploy@SERVER_IPV4
```

Create the pgAdmin server connection with:

- Host: `127.0.0.1`
- Port: `5433`
- Maintenance database: `management`
- Username: value of `POSTGRES_USER`
- Password: value of `POSTGRES_PASSWORD`

Keep the SSH command running while pgAdmin is connected. Do not expose port `5432` to the internet.

## 7. Backups and scheduled inventory check

Enable the backup script and add it to the server crontab:

```bash
chmod +x /opt/asas/app/deploy/backup.sh
crontab -e
```

Run database backups daily:

```cron
0 2 * * * /opt/asas/app/deploy/backup.sh >> /opt/asas/backups/backup.log 2>&1
```

The script retains 14 days by default. Provider-level server backups or a separate off-server copy are also required so a failed VPS does not destroy both the live database and its local backups.

Call the inventory job every six hours, replacing the secret with the value stored in `.env.production`:

```cron
0 */6 * * * curl -fsS -H "Authorization: Bearer REPLACE_WITH_CRON_SECRET" https://asas.com/api/cron/check-inventory >/dev/null
```

## Production notes

- Uploaded attachments persist in the Docker volume `uploads_data`.
- PostgreSQL data persists in `postgres_data`.
- The local Pervasive ODBC service is not reachable from the VPS without a site-to-site VPN and a compatible Linux ODBC driver.
- Test restoring a backup before considering the backup system complete.

