package web

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"
)

//go:embed all:dist
var embedded embed.FS

// Handler serves the dashboard built into the binary.
func Handler() http.Handler {
	dist, err := fs.Sub(embedded, "dist")
	if err != nil {
		panic(err)
	}
	return NewHandler(dist)
}

const (
	// Vite names every file under assets/ after a hash of its contents, so one
	// never changes: browsers may keep it a year without asking again.
	hashedDir      = "assets/"
	immutableCache = "public, max-age=31536000, immutable"
	// Everything else, index.html above all since it names the current assets,
	// is checked on each visit; unchanged, that costs a 304 and no body.
	revalidate = "no-cache"

	// Below this, gzip saves too little to be worth a second copy.
	minCompressSize = 1024
)

// Text that gzip shrinks. Fonts and images are compressed already.
var compressible = map[string]bool{
	".html": true, ".js": true, ".css": true, ".svg": true, ".json": true, ".txt": true, ".map": true,
}

// Types Go may not know without /etc/mime.types. They matter: the API sends
// X-Content-Type-Options: nosniff, so a browser trusts the type it is given.
var contentTypes = map[string]string{
	".woff2": "font/woff2",
	".woff":  "font/woff",
	".svg":   "image/svg+xml",
	".png":   "image/png",
	".ico":   "image/x-icon",
}

type file struct {
	name     string
	body     []byte
	etag     string
	gzipped  []byte // nil when not worth sending compressed
	gzipETag string // the compressed copy is a different representation
	cache    string
	ctype    string
}

// NewHandler serves the files in dist. Each is read, hashed and, where it
// helps, gzipped once here, so serving one costs no compression work. Paths
// that match no file get index.html, so a client-side route survives a refresh.
func NewHandler(dist fs.FS) http.Handler {
	files := map[string]*file{}
	err := fs.WalkDir(dist, ".", func(name string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		body, err := fs.ReadFile(dist, name)
		if err != nil {
			return err
		}
		files[name] = newFile(name, body)
		return nil
	})
	if err != nil {
		panic(err)
	}
	index := files["index.html"]

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		if name == "" {
			name = "index.html"
		}
		f, ok := files[name]
		if !ok {
			// A hashed file that is not here belongs to an older dashboard;
			// answering with index.html would hand a script tag a web page.
			if strings.HasPrefix(name, hashedDir) || index == nil {
				http.NotFound(w, r)
				return
			}
			f = index
		}
		f.serve(w, r)
	})
}

func newFile(name string, body []byte) *file {
	sum := sha256.Sum256(body)
	tag := hex.EncodeToString(sum[:12])
	f := &file{
		name:  name,
		body:  body,
		etag:  `"` + tag + `"`,
		cache: revalidate,
		ctype: contentType(name),
	}
	if strings.HasPrefix(name, hashedDir) {
		f.cache = immutableCache
	}
	if compressible[path.Ext(name)] && len(body) >= minCompressSize {
		// Kept only when it saves at least a tenth.
		if gz := gzipBytes(body); len(gz) < len(body)-len(body)/10 {
			f.gzipped = gz
			f.gzipETag = `"` + tag + `-gzip"`
		}
	}
	return f
}

func (f *file) serve(w http.ResponseWriter, r *http.Request) {
	h := w.Header()
	h.Set("Cache-Control", f.cache)
	if f.ctype != "" {
		h.Set("Content-Type", f.ctype)
	}
	body, etag := f.body, f.etag
	if f.gzipped != nil {
		h.Add("Vary", "Accept-Encoding")
		if acceptsGzip(r.Header.Get("Accept-Encoding")) {
			body, etag = f.gzipped, f.gzipETag
			h.Set("Content-Encoding", "gzip")
		}
	}
	// ServeContent answers If-None-Match against this with a 304, and handles
	// HEAD and ranges.
	h.Set("ETag", etag)
	http.ServeContent(w, r, f.name, time.Time{}, bytes.NewReader(body))
}

func contentType(name string) string {
	ext := path.Ext(name)
	if ctype, ok := contentTypes[ext]; ok {
		return ctype
	}
	// Empty leaves ServeContent to sniff the type from the content.
	return mime.TypeByExtension(ext)
}

func gzipBytes(body []byte) []byte {
	var buf bytes.Buffer
	zw, err := gzip.NewWriterLevel(&buf, gzip.BestCompression)
	if err != nil {
		panic(err) // only for an invalid level
	}
	zw.Write(body)
	zw.Close()
	return buf.Bytes()
}

// acceptsGzip reads an Accept-Encoding header: "gzip, deflate, br" accepts it,
// "gzip;q=0" refuses it, and "*" accepts it unless gzip is refused by name.
func acceptsGzip(header string) bool {
	wildcard := false
	for _, part := range strings.Split(header, ",") {
		coding, params, _ := strings.Cut(strings.TrimSpace(part), ";")
		q := 1.0
		for _, param := range strings.Split(params, ";") {
			key, value, ok := strings.Cut(strings.TrimSpace(param), "=")
			if !ok || !strings.EqualFold(strings.TrimSpace(key), "q") {
				continue
			}
			if parsed, err := strconv.ParseFloat(strings.TrimSpace(value), 64); err == nil {
				q = parsed
			}
		}
		switch strings.ToLower(strings.TrimSpace(coding)) {
		case "gzip", "x-gzip":
			return q > 0
		case "*":
			wildcard = q > 0
		}
	}
	return wildcard
}
