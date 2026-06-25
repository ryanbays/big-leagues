# Big Leagues Bot

Discord bot for SMS orders, promo lookups, email OTP workflows, FairFX checks, and optional Damru-powered browser automation.

## What This Project Does

- Runs a Discord slash-command bot with panel-based actions.
- Integrates with SMSPool for number ordering and OTP handling.
- Integrates with promo APIs through the GOTP service endpoints.
- Stores order and inbox history in a local SQLite database.
- Supports FairFX account login/check workflows.
- Can run with a Damru + redroid device pool via Docker Compose.

## Main Commands

The bot registers slash commands at startup (guild-scoped when `GUILD_ID` is set, otherwise global):

- `/ping`
- `/smspanel`
- `/promopanel`
- `/newemail`
- `/emailpanel`
- `/buyuk`
- `/history`
- `/fairfx`

## Quick Start (Local Node.js)

1. Install dependencies:

```bash
npm install
```

2. Create your env file:

```bash
cp example.env .env
```

3. Edit `.env` with at least the required values (`DISCORD_TOKEN`, `CLIENT_ID`, `SMSPOOL_API_KEY`).

4. Start the bot:

```bash
node index.js
```

## Quick Start (Docker + Damru)

If you want the full Docker stack (Discord bot + Damru pool + redroid):

1. Run guided setup:

```bash
./scripts/damru/setup-damru.sh
```

2. Start services:

```bash
docker-compose up -d
```

3. Check health:

```bash
curl http://localhost:5000/health
```

You can also use the included Just recipes:

```bash
just help
just damru-setup
just damru-health
```

## Configuration

Copy `example.env` to `.env`, then configure:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DISCORD_TOKEN` | Yes | - | Discord bot token |
| `CLIENT_ID` | Yes | - | Discord application (client) ID |
| `GUILD_ID` | No | - | Register commands to one guild for faster updates |
| `SMSPOOL_API_KEY` | Yes | - | SMSPool API key |
| `PROMO_API_KEY` | Recommended | - | Promo panel API key |
| `GOTP_API_BASE_URL` | No | `https://api.rainserver.uk` | Base URL for GOTP API |
| `EMAIL_DOMAIN` | No | `rainserver.uk` | Domain for generated inbox emails |
| `LOG_LEVEL` | No | `info` | Logging verbosity |
| `DB_PATH` | No | `./data/sqlite.index` | SQLite file path |
| `DB_FLUSH_INTERVAL_MS` | No | `30000` | WAL checkpoint interval |
| `DAMRU_API_URL` | No | `http://damru-pool:5000` | Damru service base URL |
| `DEBUG_SMSSPOOL` | No | `0` | Include raw SMS payloads in some responses |

Notes:

- The sample `example.env` contains a typo (`DOLHPIN_WEB_UI_PORT`) and duplicate `LOG_LEVEL`; these are not currently used by the Node app.
- `PROMO_API_KEY` is optional at boot, but promo features will fail if it is missing.

## Running And Operations

### Local runtime

```bash
node index.js
```

### Docker runtime

```bash
docker-compose up -d
docker-compose logs -f discord-bot
```

### Useful Just commands

```bash
just help
just ps
just logs
just damru-status
just damru-logs-f
just down
```

## Data Storage

- SQLite database is stored at `data/sqlite.index` by default.
- Docker Compose mounts a named volume for bot data (`db`).
- Tables created automatically include:
	- `orders`
	- `user_inboxes`
	- `fairfx_logins`

## Repository Layout

```text
.
|- index.js                  # App entrypoint
|- src/
|  |- discord/               # Slash commands, handlers, UI components
|  |- db/                    # SQLite setup and data access
|  |- smspool/               # SMSPool API client and parsing
|  |- gotp-api/              # Promo/email API integrations
|  |- fairfx/                # FairFX login/check flows
|  |- damru/                 # Damru client and pooling helpers
|- damru-service/            # Flask service for Damru worker pool
|- docker-compose.yml        # Bot + Damru + redroid stack
|- scripts/damru/            # Damru setup/status/cleanup scripts
|- justfile                  # Operational command recipes
```

## Related Docs

- [Damru Setup Guide](DAMRU_SETUP.md)
- [Setup Scripts Guide](SETUP_SCRIPTS.md)
- [Justfile Quick Reference](JUSTFILE_README.md)
- [Damru Service README](damru-service/README.md)
- [Damru Pool Module](src/damru/README.md)
- [Project TODO](todo.md)

## Troubleshooting

### Bot exits immediately with missing env error

Ensure `.env` includes:

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `SMSPOOL_API_KEY`

### Commands not appearing in Discord

- Confirm bot has been invited with `applications.commands` scope.
- Set `GUILD_ID` to your test server for faster command registration.
- Restart bot and watch logs for registration errors.

### Damru API not reachable

```bash
docker-compose ps
docker-compose logs damru-pool
curl http://localhost:5000/health
```

### SQLite file not where expected

Set an explicit path:

```bash
DB_PATH=./data/sqlite.index
```

## Security Notes

- Do not commit real `.env` credentials.
- FairFX credentials can be stored by command flow; treat DB files as sensitive.
- Restrict admin-style commands using Discord permissions and private channels.

## Development Notes

- Node.js runtime uses CommonJS modules.
- Command registration happens during bot startup.
- Logging is centralized in `src/logger.js` and controlled by `LOG_LEVEL`.

## License

No license file is currently present in this repository. Add one if you plan to share or distribute publicly.
