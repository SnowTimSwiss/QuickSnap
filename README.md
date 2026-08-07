# QuickSnap

QuickSnap is a minimal screenshot tool for Linux.

Its goal is simple:

Press a shortcut.

Drag a rectangle.

The screenshot is immediately copied to the clipboard.

That's it.

No editor.
No floating toolbar.
No save dialog.
No unnecessary clicks.

## Features

- Instant area selection — the rectangle starts at zero, where you press
- Direct clipboard copy — the moment you release the button
- `Super`+`Shift`+`S` by default, rebindable
- Lightweight — no helper process, no dependencies beyond GNOME itself
- Native Wayland support
- Open source

## Requirements

- **GNOME Shell 46** — the only version this has actually been run on
  (Zorin OS 18.1, Wayland). `metadata.json` deliberately declares nothing else.
- Wayland. X11 is untested, and GNOME dropped X11 sessions in Shell 49 anyway.

None of the APIs QuickSnap uses appear in the GNOME 47, 48, 49 or 50 porting
guides, so it is *likely* to work there — but likely is not tested. To widen
support, run it on that version and add the number to `shell-version`.

## Install

```sh
git clone https://github.com/SnowTimSwiss/QuickSnap.git
cd QuickSnap
./install.sh
```

On Wayland, GNOME Shell only scans for extensions when the session starts, so
**log out and back in once** after the first install. QuickSnap comes up
automatically with the new session.

Verify:

```sh
gnome-extensions info quicksnap@snowtimswiss.github.io   # State: ACTIVE
```

Uninstall with `./uninstall.sh`.

## Usage

| Action | Result |
| --- | --- |
| `Super`+`Shift`+`S` | Start the selection |
| Drag, then release | Region is on the clipboard |
| `Esc` or right-click | Cancel |
| Click without dragging | Cancel |

Paste anywhere that accepts an image. The clipboard is owned by GNOME Shell,
so the image survives for as long as your session runs — no clipboard manager
daemon required.

## Settings

```sh
gnome-extensions prefs quicksnap@snowtimswiss.github.io
```

- Capture shortcut
- Dim the area outside the selection
- Show the selection size while dragging
- Flash the captured area
- Play the shutter sound

Or straight from the command line:

```sh
gsettings --schemadir ~/.local/share/gnome-shell/extensions/quicksnap@snowtimswiss.github.io/schemas \
    set org.gnome.shell.extensions.quicksnap capture-area "['<Super><Shift>s']"
```

## Why a GNOME Shell extension?

On GNOME under Wayland, a normal application cannot read the screen. The
`org.gnome.Shell.Screenshot` D-Bus API rejects outside callers
(`AccessDenied`), and `wlr-screencopy` tools such as `grim` do not work because
Mutter does not implement that protocol. The remaining public route is the
XDG desktop portal — which opens exactly the GNOME screenshot UI with its
pre-sized floating rectangle and shutter button that QuickSnap exists to avoid.

An extension runs inside GNOME Shell itself. It can draw its own overlay, take
a real input grab, capture pixels directly and put them on the clipboard, with
no helper process and no extra dependencies.

## How it works

1. A keybinding registered through `Main.wm.addKeybinding` starts the capture.
2. A fullscreen `St.Widget` takes a modal grab and dims everything outside the
   selection while you drag.
3. On release the overlay hides, and after the next compositor frame
   `Shell.Screenshot.screenshot_area()` renders the region into a PNG.
4. `St.Clipboard.set_content()` puts the PNG on the clipboard as `image/png`.

## Provenance

The initial implementation of QuickSnap was written with AI assistance. It has
since been reviewed line by line by the author, who understands it and
maintains it. The source files carry the same statement.

This is stated openly because the extensions.gnome.org
[review guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html)
do not ban AI tooling but do require that "extension developers should be able
to justify and explain the code they submit" — and because publishing there is
an undertaking to maintain the extension for other people across GNOME
releases. Both hold here.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).

## Philosophy

Modern screenshot tools have become image editors.

QuickSnap focuses on doing one thing well:

Capture a selected screen region as fast as possible.
