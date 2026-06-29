mod clipboard;
mod gnome;

use std::error::Error;
use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;

fn main() -> ExitCode {
    match run() {
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
fn run() -> Result<bool, Box<dyn Error>> {
    if std::env::var_os("WAYLAND_DISPLAY").is_none() {
        return Err(
            "no Wayland session detected. QuickSnap currently only supports Wayland \
             (X11 support is planned, see README)."
                .into(),
        );
    }

    let (screenshot, rect) = connect_and_select_area().map_err(|err| -> Box<dyn Error> {
        format!(
            "could not reach GNOME Shell over D-Bus ({err}). QuickSnap currently requires \
             GNOME (other desktops are planned, see README)."
        )
        .into()
    })?;
    if rect.width <= 0 || rect.height <= 0 {
        return Ok(false);
    }

    let tmp_path = capture_path();
    let used_path = screenshot.screenshot_area(rect, tmp_path.to_string_lossy().as_ref())?;

    let png_bytes = fs::read(&used_path)?;
    let _ = fs::remove_file(&used_path);

    clipboard::copy_png(&png_bytes)?;
    Ok(true)
}

fn connect_and_select_area(
) -> Result<(gnome::ScreenshotProxy<'static>, gnome::Rect), Box<dyn Error>> {
    let screenshot = gnome::ScreenshotProxy::connect()?;
    let rect = screenshot.select_area()?;
    Ok((screenshot, rect))
}

fn capture_path() -> PathBuf {
    let dir = std::env::var_os("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    dir.join(format!("quicksnap-{}.png", std::process::id()))
}
