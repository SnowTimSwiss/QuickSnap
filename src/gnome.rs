use std::error::Error;

use zbus::blocking::{Connection, Proxy};

/// Talks to the `org.gnome.Shell.Screenshot` D-Bus interface exposed by
/// GNOME Shell (present on both the Wayland and X11 session backends).
pub struct ScreenshotProxy<'a> {
    proxy: Proxy<'a>,
}

#[derive(Debug, Clone, Copy)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

impl<'a> ScreenshotProxy<'a> {
    pub fn connect() -> Result<Self, Box<dyn Error>> {
        let connection = Connection::session()?;
        let proxy = Proxy::new(
            &connection,
            "org.gnome.Shell",
            "/org/gnome/Shell/Screenshot",
            "org.gnome.Shell.Screenshot",
        )?;
        Ok(Self { proxy })
    }

    /// Shows GNOME Shell's native crosshair rectangle selector and blocks
    /// until the user releases the mouse (or cancels with Escape, in which
    /// case width/height come back as 0).
    pub fn select_area(&self) -> Result<Rect, Box<dyn Error>> {
        let (x, y, width, height): (i32, i32, i32, i32) = self.proxy.call("SelectArea", &())?;
        Ok(Rect {
            x,
            y,
            width,
            height,
        })
    }

    /// Captures the given screen region to `path` (must be a writable path,
    /// PNG format). Returns the path GNOME Shell actually wrote to.
    pub fn screenshot_area(&self, rect: Rect, path: &str) -> Result<String, Box<dyn Error>> {
        let (success, used_path): (bool, String) = self.proxy.call(
            "ScreenshotArea",
            &(rect.x, rect.y, rect.width, rect.height, false, path),
        )?;
        if !success {
            return Err("GNOME Shell reported a failed screenshot capture".into());
        }
        Ok(used_path)
    }
}
