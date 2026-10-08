package web_test

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/aleh11/airtime/internal/web"
)

var (
	indexHTML = []byte("<!doctype html><title>AirTime</title>" + strings.Repeat("<div>dashboard</div>", 200))
	script    = []byte(strings.Repeat("export const tick = () => console.log('tick');\n", 200))
	font      = bytes.Repeat([]byte{0x77, 0x4f, 0x46, 0x32, 0x13, 0x9c, 0xe2, 0x05}, 600) // stands in for woff2
	favicon   = []byte(`<svg xmlns="http://www.w3.org/2000/svg"/>`)
)

func newHandler() http.Handler {
	return web.NewHandler(fstest.MapFS{
		"index.html":                  {Data: indexHTML},
		"assets/index-Ab12Cd34.js":    {Data: script},
		"assets/inter-latin-x1.woff2": {Data: font},
		"favicon.svg":                 {Data: favicon},
	})
}

func get(t *testing.T, h http.Handler, path string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func gunzip(t *testing.T, body []byte) []byte {
	t.Helper()
	zr, err := gzip.NewReader(bytes.NewReader(body))
	if err != nil {
		t.Fatalf("not gzip: %v", err)
	}
	plain, err := io.ReadAll(zr)
	if err != nil {
		t.Fatal(err)
	}
	return plain
}

func TestHashedAssetsAreKeptAYearAndSentGzipped(t *testing.T) {
	rec := get(t, newHandler(), "/assets/index-Ab12Cd34.js", map[string]string{"Accept-Encoding": "gzip, deflate, br"})

	if rec.Code != http.StatusOK {
		t.Fatalf("got %d", rec.Code)
	}
	if got := rec.Header().Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
		t.Fatalf("Cache-Control %q, want a year and immutable", got)
	}
	if rec.Header().Get("Content-Encoding") != "gzip" {
		t.Fatal("not gzipped for a browser that accepts it")
	}
	if !strings.HasPrefix(rec.Header().Get("Content-Type"), "text/javascript") {
		t.Fatalf("Content-Type %q; with nosniff a script needs its real type", rec.Header().Get("Content-Type"))
	}
	if rec.Body.Len() >= len(script) {
		t.Fatalf("sent %d bytes for a %d-byte file", rec.Body.Len(), len(script))
	}
	if !bytes.Equal(gunzip(t, rec.Body.Bytes()), script) {
		t.Fatal("gzipped body does not unpack to the file")
	}
}

func TestPlainCopyWhenGzipIsNotAccepted(t *testing.T) {
	h := newHandler()
	for _, accept := range []string{"", "identity", "gzip;q=0", "br, gzip;q=0, *"} {
		rec := get(t, h, "/assets/index-Ab12Cd34.js", map[string]string{"Accept-Encoding": accept})
		if rec.Header().Get("Content-Encoding") != "" {
			t.Fatalf("Accept-Encoding %q: got %q, want no encoding", accept, rec.Header().Get("Content-Encoding"))
		}
		if !bytes.Equal(rec.Body.Bytes(), script) {
			t.Fatalf("Accept-Encoding %q: body is not the file", accept)
		}
		// Either way a cache must key on the header.
		if rec.Header().Get("Vary") != "Accept-Encoding" {
			t.Fatalf("Accept-Encoding %q: Vary %q", accept, rec.Header().Get("Vary"))
		}
	}
	if rec := get(t, h, "/assets/index-Ab12Cd34.js", map[string]string{"Accept-Encoding": "*"}); rec.Header().Get("Content-Encoding") != "gzip" {
		t.Fatal(`"*" should accept gzip`)
	}
}

func TestIndexIsRevalidatedAndUnchangedCostsA304(t *testing.T) {
	h := newHandler()
	first := get(t, h, "/", map[string]string{"Accept-Encoding": "gzip"})

	if first.Code != http.StatusOK {
		t.Fatalf("got %d", first.Code)
	}
	if got := first.Header().Get("Cache-Control"); got != "no-cache" {
		t.Fatalf("Cache-Control %q; index.html names the current assets, so it must be checked each visit", got)
	}
	etag := first.Header().Get("ETag")
	if etag == "" {
		t.Fatal("no ETag to revalidate with")
	}
	if !bytes.Equal(gunzip(t, first.Body.Bytes()), indexHTML) {
		t.Fatal("served something other than index.html")
	}

	again := get(t, h, "/", map[string]string{"Accept-Encoding": "gzip", "If-None-Match": etag})
	if again.Code != http.StatusNotModified {
		t.Fatalf("got %d for an unchanged page, want 304", again.Code)
	}
	if again.Body.Len() != 0 {
		t.Fatalf("a 304 carried %d bytes", again.Body.Len())
	}
}

func TestGzippedAndPlainCopiesHaveTheirOwnETags(t *testing.T) {
	h := newHandler()
	zipped := get(t, h, "/index.html", map[string]string{"Accept-Encoding": "gzip"}).Header().Get("ETag")
	plain := get(t, h, "/index.html", nil).Header().Get("ETag")
	if zipped == "" || plain == "" || zipped == plain {
		t.Fatalf("ETags %q and %q; each representation needs its own", zipped, plain)
	}
	// A plain ETag must not validate the gzipped copy.
	if rec := get(t, h, "/index.html", map[string]string{"Accept-Encoding": "gzip", "If-None-Match": plain}); rec.Code != http.StatusOK {
		t.Fatalf("got %d, want the gzipped page", rec.Code)
	}
}

func TestFontsAndSmallFilesAreSentAsTheyAre(t *testing.T) {
	h := newHandler()

	fontRec := get(t, h, "/assets/inter-latin-x1.woff2", map[string]string{"Accept-Encoding": "gzip"})
	if fontRec.Header().Get("Content-Encoding") != "" || !bytes.Equal(fontRec.Body.Bytes(), font) {
		t.Fatal("a font is compressed already; it should go as it is")
	}
	if fontRec.Header().Get("Content-Type") != "font/woff2" {
		t.Fatalf("font Content-Type %q", fontRec.Header().Get("Content-Type"))
	}
	if fontRec.Header().Get("Cache-Control") != "public, max-age=31536000, immutable" {
		t.Fatal("hashed font not kept for a year")
	}

	icon := get(t, h, "/favicon.svg", map[string]string{"Accept-Encoding": "gzip"})
	if icon.Header().Get("Content-Encoding") != "" || icon.Header().Get("Vary") != "" {
		t.Fatal("a tiny file should not be gzipped")
	}
	if icon.Header().Get("Cache-Control") != "no-cache" {
		t.Fatalf("unhashed file Cache-Control %q, want no-cache", icon.Header().Get("Cache-Control"))
	}
	if icon.Header().Get("Content-Type") != "image/svg+xml" {
		t.Fatalf("svg Content-Type %q", icon.Header().Get("Content-Type"))
	}
}

func TestMissingAssetIs404AndOtherPathsGetTheDashboard(t *testing.T) {
	h := newHandler()

	// An old page asking for a script from before an update.
	if rec := get(t, h, "/assets/index-Old00000.js", nil); rec.Code != http.StatusNotFound {
		t.Fatalf("got %d for a missing hashed file, want 404", rec.Code)
	}

	rec := get(t, h, "/settings/time", nil)
	if rec.Code != http.StatusOK || !bytes.Equal(rec.Body.Bytes(), indexHTML) {
		t.Fatalf("got %d; a client-side route should get index.html", rec.Code)
	}
	if !strings.HasPrefix(rec.Header().Get("Content-Type"), "text/html") || rec.Header().Get("Cache-Control") != "no-cache" {
		t.Fatalf("route served as %q with %q", rec.Header().Get("Content-Type"), rec.Header().Get("Cache-Control"))
	}

	// Climbing out of the dashboard finds nothing beyond it.
	if rec := get(t, h, "/../../etc/passwd", nil); !bytes.Equal(rec.Body.Bytes(), indexHTML) {
		t.Fatal("a path outside the dashboard served something other than index.html")
	}
}

func TestHeadSendsHeadersOnly(t *testing.T) {
	req := httptest.NewRequest(http.MethodHead, "/assets/index-Ab12Cd34.js", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	rec := httptest.NewRecorder()
	newHandler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK || rec.Body.Len() != 0 {
		t.Fatalf("got %d with %d bytes", rec.Code, rec.Body.Len())
	}
	if rec.Header().Get("Content-Encoding") != "gzip" || rec.Header().Get("ETag") == "" {
		t.Fatalf("headers %v", rec.Header())
	}
}
