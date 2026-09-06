// Package design is the Go twin of @bytedesk/design-client: the catalog and three verbs over a
// vendored .context/design-system tree, with no dependencies beyond the standard library.
//
//	//go:embed .context/design-system
//	var vendored embed.FS
//	c, err := design.OpenFS(vendored, ".context/design-system")
//	c.BrandURL("gateway", "icon.svg")   // string, never fails
//	c.BrandLocal("gateway", "icon.svg") // vendored path or ""
//	c.BrandFetch(ctx, "gateway", "icon.svg") // bytes verified against the catalog
package design

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// FileEntry is a published file's checksum and size.
type FileEntry struct {
	SHA256 string `json:"sha256"`
	Bytes  int64  `json:"bytes"`
}

// Accent is an app's identification colour.
type Accent struct {
	Mode     string  `json:"mode"`
	Hex      *string `json:"hex"`
	Light    *string `json:"light"`
	Inherits *string `json:"inherits"`
}

// App is one catalog entry.
type App struct {
	Slug   string               `json:"-"`
	Name   string               `json:"name"`
	Kind   string               `json:"kind"`
	Status string               `json:"status"`
	Accent Accent               `json:"accent"`
	Files  map[string]FileEntry `json:"files"`
}

// Release is a version and its status: current, superseded, or withdrawn.
type Release struct {
	Version string `json:"version"`
	Status  string `json:"status"`
}

// Catalog is one release of the design system.
type Catalog struct {
	SchemaVersion int                                  `json:"schemaVersion"`
	Version       string                               `json:"version"`
	SourceSHA     string                               `json:"sourceSha"`
	PublishedAt   string                               `json:"publishedAt"`
	Base          string                               `json:"base"`
	Releases      []Release                            `json:"releases"`
	Foundation    struct{ Files map[string]FileEntry } `json:"foundation"`
	AppsByName    map[string]App                       `json:"apps"`

	fsys fs.FS  // the vendored tree, when opened from one
	dir  string // its root inside fsys
	HTTP *http.Client
}

var (
	ErrUnknownApp  = errors.New("design: app is not in the catalog")
	ErrUnknownFile = errors.New("design: file is not in the catalog")
	ErrChecksum    = errors.New("design: file does not match the catalog")
	ErrBadPath     = errors.New("design: unsafe path")
)

// Open parses a release catalog.
func Open(catalogJSON []byte) (*Catalog, error) {
	var c Catalog
	if err := json.Unmarshal(catalogJSON, &c); err != nil {
		return nil, fmt.Errorf("design: catalog: %w", err)
	}
	if c.Version == "" || c.Base == "" {
		return nil, errors.New("design: catalog has no version or base")
	}
	for slug, a := range c.AppsByName {
		a.Slug = slug
		c.AppsByName[slug] = a
	}
	c.HTTP = http.DefaultClient
	return &c, nil
}

// OpenFS opens the vendored tree at dir inside fsys (an embed.FS or os.DirFS) and reads its catalog.json.
func OpenFS(fsys fs.FS, dir string) (*Catalog, error) {
	b, err := fs.ReadFile(fsys, path.Join(dir, "catalog.json"))
	if err != nil {
		return nil, fmt.Errorf("design: %w", err)
	}
	c, err := Open(b)
	if err != nil {
		return nil, err
	}
	c.fsys, c.dir = fsys, dir
	return c, nil
}

// Apps lists every app in the catalog.
func (c *Catalog) Apps() []App {
	out := make([]App, 0, len(c.AppsByName))
	for _, a := range c.AppsByName {
		out = append(out, a)
	}
	return out
}

// App returns one entry, or nil when the slug is not in the catalog.
func (c *Catalog) App(slug string) *App {
	if a, ok := c.AppsByName[slug]; ok {
		return &a
	}
	return nil
}

// BrandURL is the CDN URL of a brand file. It never fails: a missing app still yields a URL so a
// placeholder mark can render.
func (c *Catalog) BrandURL(slug, file string) string {
	return c.Base + "apps/" + slug + "/brand/" + file
}

// BrandLocal is the vendored path of a brand file, or "" when the tree is not vendored or lacks it.
func (c *Catalog) BrandLocal(slug, file string) string {
	if c.fsys == nil || safeKey(file) != nil {
		return ""
	}
	p := path.Join(c.dir, "apps", slug, "brand", file)
	if _, err := fs.Stat(c.fsys, p); err != nil {
		return ""
	}
	return p
}

// BrandFetch reads a brand file, from the vendored tree when present and otherwise from the CDN,
// and verifies it against the catalog.
func (c *Catalog) BrandFetch(ctx context.Context, slug, file string) ([]byte, error) {
	a, ok := c.AppsByName[slug]
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrUnknownApp, slug)
	}
	if err := safeKey(file); err != nil {
		return nil, err
	}
	meta, ok := a.Files["brand/"+file]
	if !ok {
		return nil, fmt.Errorf("%w: %s/brand/%s", ErrUnknownFile, slug, file)
	}
	var b []byte
	if p := c.BrandLocal(slug, file); p != "" {
		var err error
		if b, err = fs.ReadFile(c.fsys, p); err != nil {
			return nil, err
		}
	} else {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BrandURL(slug, file), nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("User-Agent", "bytedesk-design-client-go")
		res, err := c.HTTP.Do(req)
		if err != nil {
			return nil, err
		}
		defer res.Body.Close()
		if res.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("design: %s from %s", res.Status, req.URL)
		}
		if b, err = io.ReadAll(res.Body); err != nil {
			return nil, err
		}
	}
	sum := sha256.Sum256(b)
	if hex.EncodeToString(sum[:]) != meta.SHA256 {
		return nil, fmt.Errorf("%w: %s/brand/%s", ErrChecksum, slug, file)
	}
	return b, nil
}

// ReleaseStatus reports a version's status in this catalog's releases list, or "unknown".
func (c *Catalog) ReleaseStatus(version string) string {
	for _, r := range c.Releases {
		if r.Version == version {
			return r.Status
		}
	}
	return "unknown"
}

func safeKey(key string) error {
	if key == "" || strings.ContainsAny(key, "?#%\\") {
		return fmt.Errorf("%w: %q", ErrBadPath, key)
	}
	for _, seg := range strings.Split(key, "/") {
		if seg == "" || seg == "." || seg == ".." {
			return fmt.Errorf("%w: %q", ErrBadPath, key)
		}
	}
	return nil
}
