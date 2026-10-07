package api_test

import (
	"fmt"
	"net/http"
	"slices"
	"testing"
	"time"

	"github.com/aleh11/airtime/internal/api"
	"github.com/aleh11/airtime/internal/broadcast"
	"github.com/aleh11/airtime/internal/store"
	"github.com/aleh11/airtime/internal/timezone"
)

type fakeTimeZone struct {
	current string
	set     []string
}

func (f *fakeTimeZone) Current() (string, error) { return f.current, nil }

func (f *fakeTimeZone) Available() ([]string, error) {
	return []string{"America/Antigua", "Europe/London", "UTC"}, nil
}

func (f *fakeTimeZone) Set(zone string) error {
	zones, _ := f.Available()
	if !slices.Contains(zones, zone) {
		return fmt.Errorf("%w %q", timezone.ErrUnknownZone, zone)
	}
	f.set = append(f.set, zone)
	f.current = zone
	return nil
}

type timeZoneServer struct {
	handler  http.Handler
	zone     *fakeTimeZone
	restarts int
}

func newTimeZoneServer(t *testing.T) *timeZoneServer {
	t.Helper()
	s, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { s.Close() })

	ts := &timeZoneServer{zone: &fakeTimeZone{current: "America/Antigua"}}
	now := func() time.Time { return time.Date(2026, 10, 7, 5, 5, 0, 0, time.UTC) }
	ts.handler = api.New(api.Deps{
		Store:    s,
		Runner:   broadcast.New(s, &fakeRunner{}, now),
		Metrics:  fakeMetrics{},
		TimeZone: ts.zone,
		Now:      now,
		RestartService: func() error {
			ts.restarts++
			return nil
		},
	})
	return ts
}

func TestTimeZoneIsReported(t *testing.T) {
	ts := newTimeZoneServer(t)

	rec := do(t, ts.handler, http.MethodGet, "/api/settings/timezone", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	got := decode(t, rec)
	if got["timezone"] != "America/Antigua" {
		t.Fatalf("got %v, want America/Antigua", got["timezone"])
	}
	if zones, ok := got["available"].([]any); !ok || len(zones) != 3 {
		t.Fatalf("got %v, want three zones", got["available"])
	}
}

func TestTimeZoneChangeRestartsAirTime(t *testing.T) {
	ts := newTimeZoneServer(t)

	rec := do(t, ts.handler, http.MethodPost, "/api/settings/timezone", `{"timezone":"Europe/London"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	if !slices.Equal(ts.zone.set, []string{"Europe/London"}) {
		t.Fatalf("zone set to %v, want Europe/London", ts.zone.set)
	}
	if decode(t, rec)["restarting"] != true || ts.restarts != 1 {
		t.Fatalf("restarted %d times, want 1", ts.restarts)
	}
}

func TestTimeZoneRejectsUnknownZone(t *testing.T) {
	ts := newTimeZoneServer(t)

	rec := do(t, ts.handler, http.MethodPost, "/api/settings/timezone", `{"timezone":"Mars/Olympus_Mons"}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
	if len(ts.zone.set) != 0 || ts.restarts != 0 {
		t.Fatal("an unknown zone was applied")
	}
}

func TestTimeZoneIsLockedWhileBroadcasting(t *testing.T) {
	ts := newTimeZoneServer(t)
	do(t, ts.handler, http.MethodPost, "/api/control/transmit", `{"service":"MSF","duration":10}`)

	rec := do(t, ts.handler, http.MethodPost, "/api/settings/timezone", `{"timezone":"Europe/London"}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("got %d, want 409", rec.Code)
	}
	if len(ts.zone.set) != 0 {
		t.Fatal("the zone changed during a broadcast")
	}
}

func TestTimeZoneNeedsConfiguring(t *testing.T) {
	h, _, _ := newServer(t)

	if rec := do(t, h, http.MethodGet, "/api/settings/timezone", ""); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("got %d, want 503", rec.Code)
	}
}
