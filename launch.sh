#!/bin/sh
# Herdr's background server may have a smaller PATH than an interactive shell.
set -eu
# Herdr runs this as "sh launch.sh" from the plugin root. Tests and manual
# launches may use an absolute path, so support both forms.
script_directory=${0%/*}
if [ "$script_directory" = "$0" ]; then
  script_directory=.
fi
plugin_dir=$(CDPATH= cd -- "$script_directory" && pwd)

if [ -n "${OPEN_LINKS_NODE:-}" ]; then
  if [ ! -x "$OPEN_LINKS_NODE" ]; then
    printf '%s\n' 'OPEN_LINKS_NODE must point to an executable Node.js binary.' >&2
    exit 1
  fi
  exec "$OPEN_LINKS_NODE" "$plugin_dir/index.mjs" "$@"
fi

node_on_path=$(command -v node 2>/dev/null || true)
for candidate in "$node_on_path" /opt/homebrew/bin/node /usr/local/bin/node \
  "${HOME:-}/.local/share/fnm/aliases/default/bin/node" \
  "${HOME:-}/.volta/bin/node"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    exec "$candidate" "$plugin_dir/index.mjs" "$@"
  fi
done

printf '%s\n' 'Node.js 18+ was not found. Install Node.js, or set OPEN_LINKS_NODE in the Herdr environment to its absolute executable path.' >&2
exit 1
