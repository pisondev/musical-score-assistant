# Deployment

The public site is <https://music-assistant.tierratie.com>. It runs on the VPS that also serves
the other `tierratie.com` sites, in the same way they do: a Docker container that listens on
the machine only, nginx of HestiaCP in front of it with a Let's Encrypt certificate, and
Cloudflare in front of nginx. What is not code (private songs, notes, the state of accounts)
lives in the Cloudflare R2 bucket `music-assistant`.

```
browser ──HTTPS──▶ Cloudflare ──HTTPS──▶ nginx (HestiaCP, music-assistant.tierratie.com)
                                              │  proxy_pass http://127.0.0.1:3020
                                              ▼
                                   container "musical-score-assistant"
                                   node dist-server/main.js
                                   ├─ /api/…   sign-in, private songs, notes, state ──▶ R2
                                   └─ /…       the built site (dist/)
```

Three ways things reach the site:

| What                        | How                                          | When                                    |
| --------------------------- | -------------------------------------------- | --------------------------------------- |
| Code, public songs, docs    | `git push` to `main`; GitHub Actions deploys | after every push that passes the checks |
| Private songs               | `npm run songs:push` from this computer      | when a private song is added or changed |
| Notes, favourites, settings | written by the app into R2                   | as the player uses the site             |

## What is where

On the server, everything lives in `~/projects/musical-score-assistant/` of the user
`user_pison`:

| Path                             | Content                                                      | Replaced by a deploy |
| -------------------------------- | ------------------------------------------------------------ | -------------------- |
| `.env`                           | Settings and secrets of the server (see below), mode 600     | no                   |
| `compose.yaml`                   | Copy of `deploy/compose.yaml`                                | no (`--setup`)       |
| `bin/receive`                    | Copy of `deploy/receive.sh`: takes a version, switches to it | no (`--setup`)       |
| `app/dist`, `app/dist-server`    | The built site, the bundled server, and `admin.js`           | yes                  |
| `songs/`                         | The public song folders                                      | yes                  |
| `app.previous`, `songs.previous` | The version before the last deploy                           | yes                  |
| `data/app.db`                    | The users and their state (SQLite, with `-wal` and `-shm`)   | no                   |
| `data/notes/`                    | The owner's notes, only while R2 is not configured           | no                   |

In the R2 bucket:

| Key                                    | Content                              | Written by           |
| -------------------------------------- | ------------------------------------ | -------------------- |
| `songs/private/<id>/song.txt`          | A private song                       | `npm run songs:push` |
| `songs/private/<id>/arrangements.json` | Its arrangements                     | `npm run songs:push` |
| `notes/<song id>/notes.json`           | The owner's notes on one song        | the app              |
| `backups/app-<date>.db`                | A copy of `data/app.db`, one per day | the server           |
| `users/<address>.json`                 | State from before the database       | earlier versions     |

Scans (`source.*`), readings (`analysis.md`), exported files, and local `notes.json` files never
leave this computer. Private songs never reach GitHub or the built site; the server reads them
from R2 and hands them to the signed-in owner only.

The users are kept in `data/app.db`, a SQLite database (Node's built-in `node:sqlite`), which
nothing but the server writes. Once a day the server copies it to `backups/` in the bucket and
keeps the last 14 copies. A `users/<address>.json` from before the database is moved into it the
first time its account asks for its state, and removed when the account is deleted; once every
account has signed in again, the leftovers can be deleted from the bucket.

To restore a copy, stop the container, put the copy in place of `data/app.db` (removing
`app.db-wal` and `app.db-shm`), and start it again:

```bash
ssh vps-hestia 'cd ~/projects/musical-score-assistant && docker compose stop \
  && rm -f data/app.db-wal data/app.db-shm && cp /path/to/app-<date>.db data/app.db \
  && docker compose up -d'
```

The container runs the official `node:22-alpine` image with the folders mounted; there is no
image of our own to build, and the server needs no npm packages at run time.

## The `.env` of the server

| Variable               | Meaning                                                                  |
| ---------------------- | ------------------------------------------------------------------------ |
| `PUBLIC_ORIGIN`        | `https://music-assistant.tierratie.com`; the base of the Google redirect |
| `OWNER_EMAILS`         | Comma-separated Google addresses of the owners (see Signing in)          |
| `GOOGLE_CLIENT_ID`     | The OAuth client (type "Web application") in Google Cloud Console        |
| `GOOGLE_CLIENT_SECRET` | Its secret                                                               |
| `R2_ACCOUNT_ID`        | The Cloudflare account that owns the bucket                              |
| `R2_BUCKET`            | `music-assistant`                                                        |
| `R2_ACCESS_KEY_ID`     | An R2 API token with Object Read & Write on this bucket only             |
| `R2_SECRET_ACCESS_KEY` | Its secret                                                               |
| `SESSION_SECRET`       | Signs the session cookies; changing it signs everybody out               |
| `APP_UID`, `APP_GID`   | The user the container runs as                                           |

Without all four `R2_` values the server keeps notes in `data/`, makes no daily copies, and
reads private songs from `songs/private` on its disk, which deploys no longer fill.
`ALLOWED_EMAILS`, the earlier name of `OWNER_EMAILS`, is still read, with a warning in the log.

`npm run deploy -- --setup-only` adds whatever is missing to this file from `.env.production`
on this computer (git-ignored; the same names) and a freshly generated session secret, and
installs `compose.yaml` and `bin/receive`. Values that are already there are never changed; to
change one, edit the file on the server and recreate the container:

```bash
ssh vps-hestia 'cd ~/projects/musical-score-assistant && docker compose up -d --force-recreate'
```

## Deploying

Every push to `main` deploys, through the `deploy` job of `.github/workflows/ci.yml`, once the
`verify` job has passed. Deploys run one at a time; a pull request is checked but not deployed.
The job runs the same command as this computer would:

```bash
npm run deploy
```

which

1. builds the site and the server (`npm run build`);
2. stops if the title or the folder of a private song appears anywhere in the built site;
3. stages `app/` and the public `songs/`, and sends them over SSH as one archive to
   `bin/receive`;
4. `bin/receive` moves the previous version to `*.previous`, puts the new one in place,
   recreates the container, and waits for `GET /api/health`; if the new version does not
   answer, it puts the previous one back and fails.

Locally, run it from Git Bash or the MSYS2 terminal; their `ssh` reads the alias `vps-hestia`
from the SSH configuration.

### The deploy key

GitHub Actions signs in as `user_pison` with a key of its own, kept in the repository secret
`VPS_SSH_KEY`; the host key of the server is pinned in `VPS_KNOWN_HOSTS`, and the repository
variables `VPS_HOST`, `VPS_USER`, and `PUBLIC_ORIGIN` say where to go. In
`~/.ssh/authorized_keys` on the server the key is restricted:

```
command="/home/user_pison/projects/musical-score-assistant/bin/receive",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 … github-actions-deploy@musical-score-assistant
```

Whatever the job asks for, the server runs `bin/receive` and nothing else, and `compose.yaml`
and `.env` are not part of an upload. A leaked key can therefore put a new build of the app in
place, but cannot open a shell. To replace the key: create a new one, put its private half in
`VPS_SSH_KEY` (`gh secret set VPS_SSH_KEY < key`), and swap the line in `authorized_keys`.

### Going back

`bin/receive` goes back by itself when a new version does not start. To go back from a version
that starts but misbehaves, on the server:

```bash
cd ~/projects/musical-score-assistant
mv app app.broken && mv app.previous app
mv songs songs.broken && mv songs.previous songs
docker compose up -d --force-recreate
```

Logs: `ssh vps-hestia 'cd ~/projects/musical-score-assistant && docker compose logs --tail 100'`.

## Private songs

```bash
npm run songs:push              # send what changed, remove what is gone
npm run songs:push -- --dry-run # only say what would happen
```

The script compares `songs/private/**/song.txt` and `arrangements.json` with the bucket (by
MD5, which R2 uses as the tag of a file uploaded in one piece), sends what changed, and removes
songs that no longer exist here. The site shows the change at once; the server fetches a file
again only when its tag has changed. It needs the R2 token in `.env.production`.

## The player's notes

Notes written on the public site are kept in the bucket. To read them in the editor, bring them
into the song folders here:

```bash
npm run notes:pull
```

Each `songs/<id>/notes.json` then holds the bucket's notes, plus any note that exists only on
this computer (reported as such).

## The users' comments

Members' comments are kept in the database on the server. The server answers nothing by
itself, and the author's tools do not listen on the network: `dist-server/admin.js` runs inside
the container, reached over SSH with `docker exec`.

```bash
npm run comments:pull            # new comments into songs/<id>/comments.json, marked as read
npm run comments:pull -- --all   # every comment again, with the answers sent so far
npm run comments:reply           # sends the answers written into the reply fields
```

The same by hand, on the server:

```bash
ssh vps-hestia 'docker exec musical-score-assistant node dist-server/admin.js comments --peek'
```

## Caching

Cloudflare keeps files with extensions such as `.js`, `.css`, `.woff2`, and `.mp3` at its edge;
the page itself and `/api` are always passed through. Files under `assets/` carry a hash in
their names, so a deploy never meets an old copy. The piano samples do not: they are requested
with `?v=<SAMPLE_VERSION>` (`src/audio/samples.ts`), and raising that number makes browsers,
Cloudflare, and the installed app fetch them afresh.

The service worker of the installed app, `sw.js`, has no hash in its name either. The server
sends it with `no-cache`, like the page, and browsers check it whenever the app starts, so a
deploy reaches installed apps on their next start. It asks the network first for the page and
the API, and keeps only what it can tell apart by name (see the installed app in
[architecture.md](architecture.md)). Should the worker ever have to go, deploy a `sw.js` that
unregisters itself when it activates (`self.registration.unregister()`); browsers pick it up
at their next check. A wrong answer that Cloudflare has kept (for instance a redirect
from before the certificate was in place) disappears with a purge of that address in the
Cloudflare dashboard (Caching → Configuration → Purge Cache → Custom Purge).

After HestiaCP adds a certificate, nginx has to load it: `sudo nginx -t && sudo systemctl
reload nginx`. Until then the site answers with the certificate of the panel and redirects to
plain HTTP, which Cloudflare turns into a loop.

## Signing in

Sign-in uses Google's authorization code flow with PKCE. The OAuth client lives in the Google
Cloud project "Musical Score Assistant" of `pison.gm.dev@gmail.com`, audience _External_. Its
settings:

| Field                         | Values                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Authorized JavaScript origins | `https://music-assistant.tierratie.com`, `http://localhost:5173`                                                   |
| Authorized redirect URIs      | `https://music-assistant.tierratie.com/api/auth/google/callback`, `http://localhost:5173/api/auth/google/callback` |

Anybody with a verified Google address can sign in. The addresses in `OWNER_EMAILS` are
owners: they see the licensed songs and keep notes. Everybody else is a member, who chooses
from the public songs and keeps favourites, recent songs, and settings. The role is read from
the list on every request, so a change to it applies at once. A session is a signed cookie that
lasts 30 days; deleting the account in the app ends it.

For anybody but test users to sign in, the consent screen of the client has to be published
(Google Cloud Console → Google Auth Platform → Audience → _Publish app_, from _Testing_ to _In
production_). The app asks only for `openid`, `email`, and `profile`, which need no review by
Google. The branding page of the consent screen takes:

| Field                 | Value                                                                        |
| --------------------- | ---------------------------------------------------------------------------- |
| Application home page | `https://music-assistant.tierratie.com`                                      |
| Privacy policy link   | `https://music-assistant.tierratie.com/privacy.html` (`public/privacy.html`) |
| Terms of service link | `https://music-assistant.tierratie.com/terms.html` (`public/terms.html`)     |
| Authorized domains    | `tierratie.com`: the registered domain, not the subdomain                    |

The localhost entries let the production server be tried on this computer:

```bash
npm run build
PORT=5173 PUBLIC_ORIGIN=http://localhost:5173 node --env-file=.env.production \
  scripts/node-with-sqlite.mjs dist-server/main.js
```

`npm run dev` needs none of this: the development server treats this computer as the owner.

## One-time setup

Done once, recorded here for a rebuild.

1. **Cloudflare DNS** (zone `tierratie.com`): an `A` record `music-assistant` →
   `103.87.67.77`, proxied.
2. **Cloudflare R2**: the bucket `music-assistant`, and an R2 API token with _Object Read &
   Write_ on that bucket only. Its access key id and secret go into `.env.production` as
   `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`, next to `R2_ACCOUNT_ID` and `R2_BUCKET`.
3. **HestiaCP**: an nginx template `music-assistant` (`.tpl` and `.stpl` in
   `/usr/local/hestia/data/templates/web/nginx/php-fpm/`), a copy of `tierratie-api` that
   proxies to `127.0.0.1:3020`; then, as root, and a reload of nginx:

   ```bash
   v-add-web-domain user_pison music-assistant.tierratie.com 103.87.67.77 no none
   v-change-web-domain-tpl user_pison music-assistant.tierratie.com music-assistant yes
   v-add-letsencrypt-domain user_pison music-assistant.tierratie.com
   nginx -t && systemctl reload nginx
   ```

   `user_pison` needs a password for sudo; these commands were run through the administrator
   account `bestuana10` (SSH alias `prinx`), with `user_pison` as the owner of the domain.

4. **The server**: `npm run deploy -- --setup-only`, then `npm run songs:push`.
5. **GitHub**: the deploy key and its restricted line in `authorized_keys` (above), the secrets
   `VPS_SSH_KEY` and `VPS_KNOWN_HOSTS` (`ssh-keyscan -t ed25519 103.87.67.77`, compared with the
   fingerprint this computer already trusts), and the variables `VPS_HOST`, `VPS_USER`, and
   `PUBLIC_ORIGIN`.
