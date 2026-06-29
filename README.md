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

- Instant area selection
- Direct clipboard copy
- Keyboard shortcut friendly
- Lightweight
- Native Wayland support
- X11 support (planned)
- Open source

## Philosophy

Modern screenshot tools have become image editors.

QuickSnap focuses on doing one thing well:

Capture a selected screen region as fast as possible.

## Requirements

- GNOME Shell (Wayland session). QuickSnap uses GNOME Shell's built-in
  `org.gnome.Shell.Screenshot` D-Bus interface for area selection and
  capture, so no compositor-specific protocol support is needed.
- [`wl-clipboard`](https://github.com/bugaevc/wl-clipboard) (`wl-copy`) for
  setting the clipboard. It's pulled in automatically by the `.deb`/`.rpm`
  packages.

Other desktop environments and X11 are not supported yet (see Planned).

## Installation

Prebuilt binaries, `.deb` and `.rpm` packages are published on the
[releases page](https://github.com/SnowTimSwiss/QuickSnap/releases) for
`x86_64` and `aarch64`, built automatically by GitHub Actions.

```sh
# Debian/Ubuntu
sudo apt install ./quicksnap_*.deb

# Fedora/openSUSE
sudo dnf install ./quicksnap-*.rpm

# Arch (from source, see packaging/PKGBUILD)
makepkg -si

# Any Linux: static, dependency-free binary
tar xzf quicksnap-x86_64-unknown-linux-musl.tar.gz
sudo install -Dm755 quicksnap /usr/local/bin/quicksnap
```

Or build from source with `cargo build --release`.

## Usage

Bind `quicksnap` to a keyboard shortcut (GNOME Settings → Keyboard →
Custom Shortcuts), then press it, drag a rectangle, and the screenshot
is on the clipboard.

## Planned

- Clipboard only mode
- Optional automatic file saving
- Configurable shortcuts
- Multi-monitor support
- Optional notification
- Window capture
- Delay mode
- X11 and non-GNOME desktop support
