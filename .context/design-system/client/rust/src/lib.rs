//! Rust twin of `@bytedesk/design-client`: the catalog and the verbs that need no network.
//!
//! ```no_run
//! let c = bytedesk_design::Catalog::open(".context/design-system").unwrap();
//! c.brand_url("gateway", "icon.svg");    // String, never fails
//! c.brand_local("gateway", "icon.svg");  // Some(path) when vendored
//! ```
use serde::Deserialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Deserialize)]
pub struct FileEntry {
    pub sha256: String,
    pub bytes: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Accent {
    pub mode: String,
    pub hex: Option<String>,
    pub light: Option<String>,
    pub inherits: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct App {
    pub name: String,
    pub kind: String,
    pub status: String,
    pub accent: Accent,
    pub files: BTreeMap<String, FileEntry>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Release {
    pub version: String,
    pub status: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Foundation {
    pub files: BTreeMap<String, FileEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    pub schema_version: u32,
    pub version: String,
    pub source_sha: String,
    pub published_at: String,
    pub base: String,
    pub releases: Vec<Release>,
    pub foundation: Foundation,
    pub apps: BTreeMap<String, App>,
    #[serde(skip)]
    dir: Option<PathBuf>,
}

#[derive(Debug)]
pub enum Error {
    Io(std::io::Error),
    Json(serde_json::Error),
    Invalid(&'static str),
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::Io(e) => write!(f, "design: {e}"),
            Error::Json(e) => write!(f, "design: catalog: {e}"),
            Error::Invalid(m) => write!(f, "design: {m}"),
        }
    }
}
impl std::error::Error for Error {}
impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self { Error::Io(e) }
}
impl From<serde_json::Error> for Error {
    fn from(e: serde_json::Error) -> Self { Error::Json(e) }
}

fn safe_key(key: &str) -> bool {
    !key.is_empty()
        && !key.contains(['?', '#', '%', '\\'])
        && key.split('/').all(|seg| !seg.is_empty() && seg != "." && seg != "..")
}

impl Catalog {
    /// Parses a release catalog.
    pub fn from_json(json: &str) -> Result<Catalog, Error> {
        let c: Catalog = serde_json::from_str(json)?;
        if c.version.is_empty() || c.base.is_empty() {
            return Err(Error::Invalid("catalog has no version or base"));
        }
        Ok(c)
    }

    /// Opens a vendored tree by reading `<dir>/catalog.json`; `brand_local` then resolves inside it.
    pub fn open(dir: impl AsRef<Path>) -> Result<Catalog, Error> {
        let dir = dir.as_ref().to_path_buf();
        let mut c = Catalog::from_json(&std::fs::read_to_string(dir.join("catalog.json"))?)?;
        c.dir = Some(dir);
        Ok(c)
    }

    /// Every app with its slug.
    pub fn apps(&self) -> impl Iterator<Item = (&str, &App)> {
        self.apps.iter().map(|(k, v)| (k.as_str(), v))
    }

    /// One app, or `None` when the slug is not in the catalog.
    pub fn app(&self, slug: &str) -> Option<&App> {
        self.apps.get(slug)
    }

    /// The CDN URL of a brand file. Never fails: a missing app still yields a URL for a placeholder.
    pub fn brand_url(&self, slug: &str, file: &str) -> String {
        format!("{}apps/{slug}/brand/{file}", self.base)
    }

    /// The vendored path of a brand file, when the tree was opened from a directory and holds it.
    pub fn brand_local(&self, slug: &str, file: &str) -> Option<PathBuf> {
        if !safe_key(file) || !safe_key(slug) {
            return None;
        }
        let p = self.dir.as_ref()?.join("apps").join(slug).join("brand").join(file);
        p.is_file().then_some(p)
    }

    /// A version's status in this catalog's releases list, or "unknown".
    pub fn release_status(&self, version: &str) -> &str {
        self.releases.iter().find(|r| r.version == version).map(|r| r.status.as_str()).unwrap_or("unknown")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CAT: &str = r##"{"schemaVersion":1,"version":"1.6.3","sourceSha":"abc","publishedAt":"2026-09-04T00:00:00Z","base":"https://cdn.bytedesk.ai/design/v/1.6.3/","releases":[{"version":"1.6.3","status":"current"}],"foundation":{"files":{}},"apps":{"gateway":{"name":"ByteDesk Gateway","kind":"web-app","status":"active","accent":{"mode":"family","hex":"#047BF4","light":"#255DA5","inherits":null},"files":{"brand/icon.svg":{"sha256":"x","bytes":6}}}}}"##;

    #[test]
    fn verbs() {
        let dir = std::env::temp_dir().join(format!("bytedesk-design-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("apps/gateway/brand")).unwrap();
        std::fs::write(dir.join("catalog.json"), CAT).unwrap();
        std::fs::write(dir.join("apps/gateway/brand/icon.svg"), "<svg/>").unwrap();
        let c = Catalog::open(&dir).unwrap();
        assert_eq!(c.version, "1.6.3");
        assert_eq!(c.app("gateway").unwrap().name, "ByteDesk Gateway");
        assert!(c.app("nope").is_none());
        assert_eq!(c.apps().count(), 1);
        assert_eq!(c.brand_url("gateway", "icon.svg"), "https://cdn.bytedesk.ai/design/v/1.6.3/apps/gateway/brand/icon.svg");
        assert!(!c.brand_url("missing", "icon.svg").is_empty());
        assert_eq!(c.brand_local("gateway", "icon.svg"), Some(dir.join("apps/gateway/brand/icon.svg")));
        assert_eq!(c.brand_local("gateway", "../catalog.json"), None);
        assert_eq!(c.brand_local("gateway", "og.png"), None);
        assert_eq!(c.release_status("1.6.3"), "current");
        assert_eq!(c.release_status("0.0.1"), "unknown");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn rejects_empty() {
        assert!(Catalog::from_json("{}").is_err());
        assert!(Catalog::from_json(CAT).unwrap().brand_local("gateway", "icon.svg").is_none());
    }
}
