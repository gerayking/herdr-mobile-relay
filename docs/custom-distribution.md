# Geray custom distribution

Version **0.22.6004** preserves the local mobile-control changes based on
upstream 0.22.6. The fork uses the 0.22.6000 patch series so its releases can
use the existing strict MAJOR.MINOR.PATCH installer without reusing upstream
release tags. Release downloads and the phone-driven relay updater point to
`gerayking/herdr-mobile-relay`.

## Included changes

- A one-tap entry for queued Codex questions above the terminal, with pending
  counts, opening feedback, retry, and the existing structured answer form.
- Relay-first home navigation with independent collapsible machine groups,
  connection and pending-agent summaries, and saved expansion state.
- Explicit opt-in for root-owned relay services and distinct relay labels.
- Codex conversation lookup in archived sessions, with active sessions preferred
  and escaping symlinks rejected.
- KaTeX rendering with bundled fonts and license; no external font service.
- Persistent conversation, terminal, and agent previews for startup and reconnects.
  Cached agent entries cannot send commands before live inventory returns.
- A device setting to disable and clear saved conversations and terminals.
- WebSocket connection deadlines and resume probing before discarding an
  existing direct WebSocket session.

## Install on another machine

Install Herdr for the user whose agents you want to control. Then run:

```sh
herdr plugin install gerayking/herdr-mobile-relay --ref v0.22.6004 --yes
```

The plugin downloads the complete release for Linux or macOS on amd64 or arm64,
verifies its SHA-256 and manifest against the release tag commit, and registers
the normal Herdr plugin actions. End-user machines need no Go or Bun toolchain.
For an intentional root installation, prefix the install/setup commands with
`HERDR_MOBILE_RELAY_ALLOW_ROOT=1`, as described in
[the stable tunnel guide](cloudflare-tunnel.md).

Use **Stable Cloudflare Tunnel** to configure a dedicated tunnel and a unique
hostname for this machine. Select the same existing phone-app origin on every
machine. `HERDR_PHONE_APP_URL` can supply that origin during setup. Give each
relay a distinct `HERDR_RELAY_LABEL` and an available loopback port.
Keep the existing app deployment owner; adding a machine does not require
publishing another phone app. Generate fresh device invitations on the new relay,
and add each relay to the same installed phone app.

```sh
herdr plugin action invoke install-service --plugin herdr-mobile-relay.events
herdr plugin action invoke setup-link --plugin herdr-mobile-relay.events
herdr plugin action invoke status --plugin herdr-mobile-relay.events
```

Do not copy another machine's runtime environment, tunnel credentials, device
database, or private keys. Notifications are optional; this release does not
require enabling them.

## Verify and update

The local and public `/healthz` endpoints should report version `0.22.6004`,
the release tag's commit in `revision`, and ready inventory once Herdr is
reachable. A separately hosted phone app reports its own build identity and is
updated only by its deployment owner.

Release assets contain binaries, web assets, runtime scripts, license, README,
and a release manifest. They exclude machine configuration and credentials.
Use a later tag from this fork to update; explicitly installing the upstream
plugin switches back to upstream behavior.
