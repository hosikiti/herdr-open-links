# Setup and implementation details

## Shortcut setup

```sh
herdr plugin action invoke hosikiti.open-links.setup-keys
```

This action locates Herdr's config using `HERDR_CONFIG_PATH`, then
`XDG_CONFIG_HOME`, then `~/.config/herdr/config.toml`. It reuses any existing
binding to this plugin. Otherwise it adds `prefix+u`, checks the result with
`herdr config check`, backs up the original, and reloads Herdr. If reload fails,
the original config is restored. Setup messages appear in plugin logs:

```sh
herdr plugin log list --plugin hosikiti.open-links
```

Setup supports ordinary TOML tables. For multiline strings, inline tables, a
conflicting key, or a different shortcut, edit `config.toml` manually:

```toml
[[keys.command]]
key = "prefix+u"
type = "plugin_action"
command = "hosikiti.open-links.pick"
description = "open links from pane"
```

```sh
herdr server reload-config
```

Direct modifier chords depend on the terminal; the prefix binding is recommended.
Without a shortcut, launch the picker with:

```sh
herdr plugin action invoke hosikiti.open-links.pick
```

## Node discovery

The launcher checks `node` on Herdr's server PATH, then standard Homebrew,
fnm default, and Volta locations. This handles background servers whose PATH
is different from an interactive shell. Both Apple Silicon and Intel Homebrew
paths are supported.

For another installation, set `OPEN_LINKS_NODE` to the absolute Node executable
in the environment used to start the Herdr server. An explicit override takes
precedence. The launcher reports an error if Node cannot be found.

## Targets and wrapping

- HTTP and HTTPS URLs, including long OAuth URLs, queries, and fragments
- Local `file://` URLs, including percent-encoded spaces
- Existing absolute paths, `~/` paths, and relative paths
- Quoted paths containing spaces
- OSC 8 terminal hyperlinks with destinations hidden behind short labels

The picker reads the source pane's last 500 logical lines, deduplicates targets,
and places recent text matches first. Relative paths resolve against the pane's
reported working directory. Files must exist on this Mac; remote files are not
fetched. A `:line[:column]` suffix is removed when it refers to an existing file;
opening at a specific editor line is not currently supported.

Enter opens the selected target directly. Shift+Enter opens the parent folder
of a local file or folder; web links have no containing folder. The picker
requests modifier-aware input using the [Kitty keyboard protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/)
and restores the previous mode when it closes. This requires Herdr and the
outer terminal to preserve Shift+Enter as a distinct key.

Herdr's `recent-unwrapped` API joins terminal soft wraps. When an application
inserts actual line breaks, the plugin tries up to four continuation lines for
existing local paths. Long web URLs with path/query-shaped continuations are
also reconstructed and marked `↪`. Ambiguous hard breaks cannot always be
recovered. A two-row preview of the selected destination appears below the list.

Extraction happens locally. The plugin does not fetch URLs, use the clipboard,
or save scanned pane contents. Choosing a web target opens it in your browser.

## Source guide

| File                | Responsibility                                           |
| ------------------- | -------------------------------------------------------- |
| `herdr-plugin.toml` | Public actions and popup definition                      |
| `launch.sh`         | Find Node and start the entry point                      |
| `index.mjs`         | Dispatch actions and read the source pane through Herdr  |
| `picker.mjs`        | Render the popup and handle keyboard input               |
| `links.mjs`         | Extract, reconstruct, and resolve URLs/paths             |
| `setup.mjs`         | Preserve config, add the shortcut, validate, and reload  |
| `*.test.mjs`        | Extraction, runtime discovery, and config-editing checks |

Comments explain wrap heuristics, terminal escape handling, and config changes.
Formatting uses Prettier with two-space indentation and an 80-column target.
Prettier is a development dependency only; using the plugin requires no packages.

```sh
npm test
npm run check
npm run format:check
```

## Uninstall

Remove the `keys.command` block for `hosikiti.open-links.pick` from your config,
then reload it and unregister the plugin:

```sh
herdr server reload-config
herdr plugin unlink hosikiti.open-links  # local checkout
# or: herdr plugin uninstall hosikiti.open-links  # GitHub installation
```

## Rebuild the demo GIF

Run `npm run demo` with Node.js and ffmpeg installed. The generator captures
the actual picker with sample targets and simulated browser opening, then
renders `assets/demo.gif`. It never reads a live pane or opens a URL.
On macOS it uses Menlo; elsewhere set `DEMO_FONT` to a monospace font file.
