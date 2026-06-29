use std::error::Error;
use std::path::PathBuf;

use ashpd::desktop::screenshot::Screenshot;
use ashpd::desktop::ResponseError;

/// Shows the desktop's interactive screenshot picker (rectangle selection)
/// via the XDG Desktop Portal and returns the captured PNG bytes.
///
/// GNOME Shell's private `org.gnome.Shell.Screenshot` D-Bus interface used
/// to allow this directly, but recent GNOME versions lock it down to
/// trusted callers only. The portal is the sanctioned replacement; the
/// tradeoff is that GNOME's portal backend shows its full Screenshot UI
/// (with an explicit capture button) rather than a bare crosshair selector.
///
/// Returns `Ok(None)` if the user cancelled.
pub async fn capture_interactive() -> Result<Option<Vec<u8>>, Box<dyn Error>> {
    let request = Screenshot::request()
        .interactive(true)
        .modal(true)
        .send()
        .await?;

    let response = match request.response() {
        Ok(response) => response,
        Err(ashpd::Error::Response(ResponseError::Cancelled)) => return Ok(None),
        Err(err) => return Err(err.into()),
    };

    let path = uri_to_path(response.uri().as_str())?;
    let bytes = std::fs::read(&path)?;
    let _ = std::fs::remove_file(&path);
    Ok(Some(bytes))
}

fn uri_to_path(uri: &str) -> Result<PathBuf, Box<dyn Error>> {
    url::Url::parse(uri)?
        .to_file_path()
        .map_err(|()| "screenshot portal returned a non-file URI".into())
}
