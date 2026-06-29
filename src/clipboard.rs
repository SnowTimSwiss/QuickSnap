use std::error::Error;
use std::io::Write;
use std::process::{Command, Stdio};

/// Copies PNG bytes to the Wayland clipboard.
///
/// GNOME's compositor (Mutter) doesn't implement the wlr/ext data-control
/// protocol extensions, so an in-process Wayland clipboard client can't set
/// the selection there. `wl-copy` already ships the focus-grab workaround
/// needed on exactly those compositors, so we shell out to it rather than
/// reimplementing that workaround ourselves.
pub fn copy_png(png_bytes: &[u8]) -> Result<(), Box<dyn Error>> {
    let mut child = Command::new("wl-copy")
        .arg("--type")
        .arg("image/png")
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|err| -> Box<dyn Error> {
            if err.kind() == std::io::ErrorKind::NotFound {
                "wl-copy not found. Install the 'wl-clipboard' package to enable clipboard support."
                    .into()
            } else {
                err.into()
            }
        })?;

    child
        .stdin
        .take()
        .expect("stdin was piped")
        .write_all(png_bytes)?;

    let status = child.wait()?;
    if !status.success() {
        return Err("wl-copy exited with a non-zero status".into());
    }
    Ok(())
}
