mod clipboard;
mod portal;

use std::error::Error;
use std::process::ExitCode;

fn main() -> ExitCode {
    match async_std::task::block_on(run()) {
        Ok(true) => ExitCode::SUCCESS,
        Ok(false) => ExitCode::SUCCESS, // user cancelled the selection
        Err(err) => {
            eprintln!("quicksnap: {err}");
            ExitCode::FAILURE
        }
    }
}

/// Returns `Ok(false)` if the user cancelled the selection, `Ok(true)` on a
/// successful capture + clipboard copy.
async fn run() -> Result<bool, Box<dyn Error>> {
    if std::env::var_os("WAYLAND_DISPLAY").is_none() {
        return Err(
            "no Wayland session detected. QuickSnap currently only supports Wayland \
             (X11 support is planned, see README)."
                .into(),
        );
    }

    let Some(png_bytes) = portal::capture_interactive().await? else {
        return Ok(false);
    };

    clipboard::copy_png(&png_bytes)?;
    Ok(true)
}
