# Herdr Open Links

**Open URLs and local paths from your [Herdr](https://herdr.dev) pane—even when they wrap across lines.**

Press your Herdr prefix, then **U**, and choose a link. Open web URLs, files,
and folders without selecting or copying text.

Handles long sign-in URLs, `file://` links, local paths with spaces, and
wrapped paths. **Shift+Enter** opens the containing folder in Finder.

![Illustrated Herdr window with two panes and the Open Links picker](assets/demo.gif?v=2)

Illustrated preview with sample links. The plugin scans the focused pane.

**Requires macOS, Herdr 0.7.5+, and Node.js 18+.** No additional packages or build step.

## Install

```sh
herdr plugin install hosikiti/herdr-open-links
herdr plugin action invoke hosikiti.open-links.setup-keys
```

The setup action adds **prefix → U**, then reloads Herdr. It preserves an
existing shortcut and refuses to overwrite another action using that key.

## Use

Press **Ctrl+B, then U** (the default Herdr prefix), then the letter beside a target.
With `prefix = "cmd+p"`, press **Cmd+P, then U** instead.

```text
Open Links

› a  web    https://example.com/docs
  s  folder /path/to/project/desktop/release
  d  file   /path/to/project/README.md
```

Web links open in your browser; files and folders use their macOS default app.
Supports HTTP/HTTPS, local `file://` URLs, existing paths, and terminal hyperlinks.

- `/` searches; Enter finishes searching.
- A letter or Enter opens a target.
- Shift+Enter opens the selected local path's containing folder in Finder.
- Up/Down selects; Left/Right changes page.
- Esc clears search or closes the picker.

## Why choose Open Links?

Open Links combines web links and existing local paths in one small picker,
using your Mac's default apps. It scans only the focused pane's visible screen,
without scrolling through its history, and tries to recover paths and URLs
split across lines.

Wrapped text on the visible screen is reconstructed where possible. Ambiguous
line breaks cannot always be recovered.

## Similar plugins

| Plugin                                                   | Useful when you want…                                                        |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Open Links**                                           | URLs and local paths together, default macOS apps, and broken-line recovery  |
| [Openr](https://github.com/wraithyy/herdr-openr)         | Claude transcript scanning, configurable editors, copying, and Finder reveal |
| [Link Hints](https://github.com/reobin/herdr-link-hints) | URL hints, additional URL schemes, and a prebuilt binary                     |
| [Termscope](https://github.com/iurysza/termscope)        | Multiple-pane scanning, file previews, and editor line navigation            |
| [FZF URL Picker](https://github.com/x0d7x/herdr-fzf-url) | Multiple-pane URL scanning with fuzzy search and copying                     |

See the [dated comparison](docs/COMPARISON.md) for sample extraction results,
the exact revisions examined, and limitations. These tools overlap; choose
the workflow that fits your setup.

## Local development

```sh
herdr plugin link "$HOME/projects/herdr-open-links"
herdr plugin action invoke hosikiti.open-links.setup-keys
npm test
```

Tests use built-in Node tools and need no install. For formatting:

```sh
npm ci
npm run format
npm run format:check
```

See [details](docs/DETAILS.md) for manual setup, Node discovery, limitations,
uninstalling, and a guide to the source files.

[MIT license](LICENSE) · hosikiti
