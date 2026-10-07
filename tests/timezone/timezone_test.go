package timezone_test

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/aleh11/airtime/internal/timezone"
)

// fakeTimedatectl writes a stand-in for timedatectl that logs every call.
func fakeTimedatectl(t *testing.T, setExit int) (timezone.System, string) {
	t.Helper()
	dir := t.TempDir()
	log := filepath.Join(dir, "calls.log")
	script := fmt.Sprintf(`#!/bin/sh
echo "$@" >> %q
case "$1" in
  show) echo "America/Antigua" ;;
  list-timezones) printf 'America/Antigua\nEurope/London\nUTC\n' ;;
  set-timezone) if [ %d -ne 0 ]; then echo "Access denied" >&2; exit %d; fi ;;
esac
`, log, setExit, setExit)
	path := filepath.Join(dir, "timedatectl")
	if err := os.WriteFile(path, []byte(script), 0o755); err != nil {
		t.Fatalf("write stand-in: %v", err)
	}
	return timezone.System{Command: path}, log
}

func calls(t *testing.T, log string) string {
	t.Helper()
	data, err := os.ReadFile(log)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("read call log: %v", err)
	}
	return string(data)
}

func TestCurrentAsksTimedatectl(t *testing.T) {
	system, _ := fakeTimedatectl(t, 0)

	zone, err := system.Current()
	if err != nil {
		t.Fatalf("current: %v", err)
	}
	if zone != "America/Antigua" {
		t.Fatalf("got %q, want America/Antigua", zone)
	}
}

func TestAvailableListsZones(t *testing.T) {
	system, _ := fakeTimedatectl(t, 0)

	zones, err := system.Available()
	if err != nil {
		t.Fatalf("available: %v", err)
	}
	if !slices.Equal(zones, []string{"America/Antigua", "Europe/London", "UTC"}) {
		t.Fatalf("got %v", zones)
	}
}

func TestSetChangesListedZone(t *testing.T) {
	system, log := fakeTimedatectl(t, 0)

	if err := system.Set("Europe/London"); err != nil {
		t.Fatalf("set: %v", err)
	}
	if !strings.Contains(calls(t, log), "set-timezone Europe/London") {
		t.Fatalf("timedatectl was not asked to set the zone:\n%s", calls(t, log))
	}
}

func TestSetRefusesUnlistedZone(t *testing.T) {
	system, log := fakeTimedatectl(t, 0)

	err := system.Set("--help")
	if !errors.Is(err, timezone.ErrUnknownZone) {
		t.Fatalf("got %v, want ErrUnknownZone", err)
	}
	if strings.Contains(calls(t, log), "set-timezone") {
		t.Fatal("an unlisted zone reached timedatectl")
	}
}

func TestSetReportsTimedatectlFailure(t *testing.T) {
	system, _ := fakeTimedatectl(t, 1)

	err := system.Set("Europe/London")
	if err == nil || !strings.Contains(err.Error(), "Access denied") {
		t.Fatalf("got %v, want timedatectl's own message", err)
	}
}

func TestParseListSkipsBlankLines(t *testing.T) {
	got := timezone.ParseList("Africa/Abidjan\n\n  Europe/London \nUTC\n")
	if !slices.Equal(got, []string{"Africa/Abidjan", "Europe/London", "UTC"}) {
		t.Fatalf("got %v", got)
	}
}

func TestZoneFromLink(t *testing.T) {
	cases := map[string]string{
		"/usr/share/zoneinfo/America/Antigua":     "America/Antigua",
		"../usr/share/zoneinfo/Europe/London":     "Europe/London",
		"/usr/share/zoneinfo/posix/Asia/Tokyo":    "Asia/Tokyo",
		"/usr/share/zoneinfo/Etc/UTC":             "Etc/UTC",
		"/var/db/timezone/zoneinfo/Europe/Berlin": "Europe/Berlin",
	}
	for target, want := range cases {
		if got, ok := timezone.ZoneFromLink(target); !ok || got != want {
			t.Errorf("%s: got %q %v, want %q", target, got, ok, want)
		}
	}
	if _, ok := timezone.ZoneFromLink("/etc/localtime.bak"); ok {
		t.Error("a path outside zoneinfo was read as a zone")
	}
}
