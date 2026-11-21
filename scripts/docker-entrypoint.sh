#!/bin/sh
# Container entrypoint (see Dockerfile).
#
# Hearth keeps two small files of its own (family colors, allowance balances) in
# HEARTH_DATA_DIR, a Railway volume. Railway mounts volumes owned by root, and
# the app runs as the unprivileged "nextjs" user, so it could not write there.
# This starts as root for one job, handing that directory to the app user, then
# drops to "nextjs" for good before starting the server. Nothing else runs as
# root. With no volume configured it only drops privileges.

if [ "$(id -u)" = "0" ]; then
  if [ -n "$HEARTH_DATA_DIR" ]; then
    mkdir -p "$HEARTH_DATA_DIR" 2>/dev/null || true
    chown -R nextjs:nodejs "$HEARTH_DATA_DIR" 2>/dev/null || true
  fi
  exec su-exec nextjs "$@"
fi

# Already unprivileged (a platform that forces a user): just run.
exec "$@"
