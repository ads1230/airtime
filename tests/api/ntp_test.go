package api_test

import (
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/aleh11/airtime/internal/api"
	"github.com/aleh11/airtime/internal/broadcast"
	"github.com/aleh11/airtime/internal/ntp"
	"github.com/aleh11/airtime/internal/store"
)

type fakeTimeServers struct {
	ready   bool
	servers []string
}

func (f *fakeTimeServers) Ready() bool                { return f.ready }
func (f *fakeTimeServers) SourceDir() string          { return "/var/lib/airtime/chrony" }
func (f *fakeTimeServers) Servers() ([]string, error) { return f.servers, nil }

func (f *fakeTimeServers) SetServers(servers []string) error {
	for _, server := range servers {
		if !ntp.ValidServer(server) {
			return fmt.Errorf("%w %q", ntp.ErrInvalidServer, server)
		}
	}
	if !f.ready {
		return ntp.ErrNotSetUp
	}
	f.servers = servers
	return nil
}

func (f *fakeTimeServers) Current() (*ntp.Source, error) {
	return &ntp.Source{Name: "ntp1.npl.co.uk", Stratum: 1, OffsetMS: -0.4}, nil
}

func newTimeServerServer(t *testing.T, ready bool) (http.Handler, *fakeTimeServers) {
	t.Helper()
	s, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { s.Close() })

	servers := &fakeTimeServers{ready: ready, servers: []string{}}
	now := func() time.Time { return time.Date(2026, 10, 7, 5, 5, 0, 0, time.UTC) }
	return api.New(api.Deps{
		Store:       s,
		Runner:      broadcast.New(s, &fakeRunner{}, now),
		Metrics:     fakeMetrics{},
		TimeServers: servers,
		Now:         now,
	}), servers
}

func TestTimeServersAreReported(t *testing.T) {
	h, _ := newTimeServerServer(t, true)

	rec := do(t, h, http.MethodGet, "/api/settings/ntp", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	got := decode(t, rec)
	if got["ready"] != true || got["source_dir"] != "/var/lib/airtime/chrony" {
		t.Fatalf("got %v", got)
	}
	if current, ok := got["current"].(map[string]any); !ok || current["name"] != "ntp1.npl.co.uk" {
		t.Fatalf("current: got %v", got["current"])
	}
}

func TestTimeServersChange(t *testing.T) {
	h, servers := newTimeServerServer(t, true)

	rec := do(t, h, http.MethodPost, "/api/settings/ntp", `{"servers":["ntp1.npl.co.uk","ntp4.npl.co.uk"]}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	if len(servers.servers) != 2 {
		t.Fatalf("servers set to %v", servers.servers)
	}
}

func TestTimeServersRejectInvalidHost(t *testing.T) {
	h, servers := newTimeServerServer(t, true)

	rec := do(t, h, http.MethodPost, "/api/settings/ntp", `{"servers":["ntp1.npl.co.uk\nsourcedir /etc"]}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
	if len(servers.servers) != 0 {
		t.Fatal("an invalid server was applied")
	}
}

func TestTimeServersNeedChronySetUp(t *testing.T) {
	h, _ := newTimeServerServer(t, false)

	rec := do(t, h, http.MethodPost, "/api/settings/ntp", `{"servers":["ntp1.npl.co.uk"]}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("got %d, want 409", rec.Code)
	}
}

func TestTimeServersAreLockedWhileBroadcasting(t *testing.T) {
	h, servers := newTimeServerServer(t, true)
	do(t, h, http.MethodPost, "/api/control/transmit", `{"service":"MSF","duration":10}`)

	rec := do(t, h, http.MethodPost, "/api/settings/ntp", `{"servers":["ntp1.npl.co.uk"]}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("got %d, want 409", rec.Code)
	}
	if len(servers.servers) != 0 {
		t.Fatal("the time server changed during a broadcast")
	}
}
