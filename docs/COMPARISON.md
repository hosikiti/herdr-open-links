# Comparison with similar plugins

Compared on **2026-10-03**. This is a snapshot of specific revisions, not a
claim that Open Links is universally better. Other plugins may change.

## Revisions examined

| Plugin         | Revision  | Source examined                                                                                                                                                             |
| -------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open Links     | `ebf2ccd` | [Extraction](https://github.com/hosikiti/herdr-open-links/blob/ebf2ccd23b5ce1e63f42551ea7c56a780d99024c/links.mjs), pane scanning, picker, and tests                        |
| Openr          | `12089bf` | [Pane extraction](https://github.com/wraithyy/herdr-openr/blob/12089bf35bd0f47923adc245aaa0181ab5b3ff32/bin/open.sh), picker, and README                                    |
| Link Hints     | `a7e6428` | [Scanner](https://github.com/reobin/herdr-link-hints/blob/a7e6428fa8dcb513bb3755f47855422b3357e394/internal/scan/scan.go), URL extraction, opener, installer, and tests     |
| Termscope      | `d5774a7` | [Extraction and opening](https://github.com/iurysza/termscope/blob/d5774a74a47e3b6890506aef94b696d6b669cb50/termscope), manifest, tests, and README; source inspection only |
| FZF URL Picker | `7f5fc52` | [Extraction and opening](https://github.com/x0d7x/herdr-fzf-url/blob/7f5fc52a4367c537cae11b636bb27bc26e2279ad/main.go), manifest, and README                                |

## Isolated extraction checks

Each check asks whether the plugin recovered the **complete expected target**.
A partial URL or a different path does not count. A miss here does not mean
the plugin lacks that feature in every scenario.

| Sample input                                             | Open Links | Openr | Link Hints | FZF URL Picker |
| -------------------------------------------------------- | :--------: | :---: | :--------: | :------------: |
| Complete URL over 12 KB                                  |    Yes     |  Yes  |    Yes     |      Yes       |
| Quoted filename with spaces                              |    Yes     |  No   |     No     |       No       |
| Local `file://` URL with an encoded space                |    Yes     |  No   |    Yes     |      Yes       |
| Existing path split inside a word by an inserted newline |    Yes     |  No   |     No     |       No       |
| Long URL followed by an inserted query/path continuation |    Yes     |  No   |     No     |       No       |

### Sample inputs

All inputs were synthetic. A temporary folder contained `hello world.txt`
and the directory `desktop-release/desktop/release`. Relative filenames
resolved against that temporary folder.

1. **Long URL:** `https://accounts.example.com/auth?scope=` followed by
   `demo.read%20` repeated 1,100 times, then `&state=synthetic`. The expected
   result was the complete URL, unchanged.
2. **Spaces:** `"hello world.txt"`. The expected result was the existing file.
3. **File URL:** the temporary file's absolute `file://` URL, with its space
   encoded as `%20`. Both a decoded local path and the original file URL
   counted as identifying the same target.
4. **Broken path:** the temporary directory's absolute path, split as
   `…/desktop-release/deskto`, a newline, then two spaces and `p/release`.
   The expected result was the complete existing directory.
5. **Broken URL:** `https://example.com/` followed by 65 `a` characters,
   a newline, then two spaces and `/more?x=1`. The expected result joined
   the continuation onto the original URL.

### Method and limits

- Open Links: called `extract(text, cwd)` directly.
- Openr: ran `bin/open.sh visible` against a mocked Herdr CLI and examined
  the candidate list passed to its popup. Used a separate temporary home.
- Link Hints: called its actual scanner with a mocked pane source, a width
  of 80 columns, and no hidden terminal hyperlinks.
- FZF URL Picker: called `collectURLs` against a mocked Herdr CLI supplying
  the sample pane output.
- No actual browser, Finder, editor, popup, or live Herdr pane was opened.
  These checks compare candidate extraction, not successful OS opening.
- The newline cases contain **actual inserted newlines**, not terminal soft
  wraps. They do not establish that the other plugins fail on soft wraps;
  Link Hints explicitly implements wrapped-URL recovery.
- These five cases are not a broad benchmark. They do not measure speed,
  false positives, Unicode rendering, or behavior across terminal versions.
- Termscope was inspected but not executed and is excluded from the matrix.

## Choosing a workflow

Open Links is useful for macOS users who want web URLs, existing files, and
folders together, opened through their normal default apps. It needs Node.js
18+ but no extra packages, fuzzy-finder executable, or compilation step.
Quoted paths with spaces and recovery of some inserted line breaks are
practical strengths demonstrated by the samples above.

The alternatives offer useful capabilities that Open Links does not:

- **Openr:** reads Claude transcripts, supports configurable editors and
  line numbers, copies targets, reveals files in Finder, and supports Linux.
- **Link Hints:** supports additional URL forms and schemes, terminal
  hyperlinks, and wrapped URLs. Installation downloads a prebuilt binary;
  normal use does not require Node or a Go compiler.
- **Termscope:** scans visible panes in the current tab, previews files,
  preserves editor line numbers, and falls back to a repository file picker.
- **FZF URL Picker:** collects URLs across panes, uses fuzzy search, supports
  copying, and supports Linux.

Open Links currently scans one focused pane, uses substring search, and has
no copy action, Claude transcript scanning, editor line navigation, or Linux
support. Its inserted-newline recovery is heuristic. Long URLs, letter hints,
file URLs, and containing-folder actions are not exclusive to Open Links.
