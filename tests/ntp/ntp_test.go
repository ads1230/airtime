package ntp_test

import (
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/aleh11/airtime/internal/ntp"
)

// setup returns a Chrony whose config does or does not name its sourcedir.
func setup(t *testing.T, ready bool) (ntp.Chrony, *int) {
	t.Helper()
	root := t.TempDir()
	dir := filepath.Join(root, "airtime", "chrony")
	config := filepath.Join(root, "chrony.conf")

	content := "pool 2.debian.pool.ntp.org iburst\nsourcedir /run/chrony-dhcp\n"
	if ready {
		content += "sourcedir " + dir + "\n"
	}
	write(t, config, content)

	restarts := 0
	return ntp.Chrony{
		Dir:        dir,
		ConfigFile: config,
		Restart:    func() error { restarts++; return nil },
	}, &restarts
}

func write(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestValidServer(t *testing.T) {
	for _, good := range []string{"ntp1.npl.co.uk", "time.nist.gov", "uk.pool.ntp.org", "localhost", "192.0.2.10", "2001:db8::1"} {
		if !ntp.ValidServer(good) {
			t.Errorf("%q was rejected", good)
		}
	}
	for _, bad := range []string{"", "-ntp.example", "ntp..example", "ntp example", "ntp1.npl.co.uk\nsourcedir /etc", "ntp;reboot", "server ntp1", strings.Repeat("a", 64) + ".example"} {
		if ntp.ValidServer(bad) {
			t.Errorf("%q was accepted", bad)
		}
	}
}

func TestSourcesLine(t *testing.T) {
	cases := map[string]string{
		"ntp1.npl.co.uk":  "server ntp1.npl.co.uk iburst prefer",
		"uk.pool.ntp.org": "pool uk.pool.ntp.org iburst prefer",
		"time.nist.gov":   "server time.nist.gov prefer",
		"notpool.ntp.org": "server notpool.ntp.org iburst prefer",
	}
	for server, want := range cases {
		if got := ntp.SourcesLine(server); got != want {
			t.Errorf("%s: got %q, want %q", server, got, want)
		}
	}
}

func TestReadyNeedsTheSourcedir(t *testing.T) {
	if chrony, _ := setup(t, false); chrony.Ready() {
		t.Fatal("ready without the sourcedir line")
	}
	if chrony, _ := setup(t, true); !chrony.Ready() {
		t.Fatal("not ready with the sourcedir line")
	}
}

func TestReadyFollowsConfdir(t *testing.T) {
	chrony, _ := setup(t, false)
	confd := filepath.Join(filepath.Dir(chrony.ConfigFile), "conf.d")
	write(t, chrony.ConfigFile, "confdir "+confd+"\npool 2.debian.pool.ntp.org iburst\n")
	write(t, filepath.Join(confd, "airtime.conf"), "# AirTime\nsourcedir "+chrony.Dir+"\n")

	if !chrony.Ready() {
		t.Fatal("a sourcedir in a confdir file was missed")
	}
}

func TestReadyIgnoresCommentedLine(t *testing.T) {
	chrony, _ := setup(t, false)
	write(t, chrony.ConfigFile, "# sourcedir "+chrony.Dir+"\n")
	if chrony.Ready() {
		t.Fatal("a commented-out sourcedir counted")
	}
}

func TestSetServersWritesSourcesAndRestartsChrony(t *testing.T) {
	chrony, restarts := setup(t, true)

	if err := chrony.SetServers([]string{" NTP1.npl.co.uk ", "ntp4.npl.co.uk", "ntp1.npl.co.uk", ""}); err != nil {
		t.Fatalf("set: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(chrony.Dir, ntp.SourcesFile))
	if err != nil {
		t.Fatalf("read sources: %v", err)
	}
	for _, want := range []string{"server ntp1.npl.co.uk iburst prefer\n", "server ntp4.npl.co.uk iburst prefer\n"} {
		if !strings.Contains(string(data), want) {
			t.Errorf("sources file lacks %q:\n%s", want, data)
		}
	}
	if *restarts != 1 {
		t.Fatalf("chrony restarted %d times, want 1", *restarts)
	}

	servers, err := chrony.Servers()
	if err != nil || !slices.Equal(servers, []string{"ntp1.npl.co.uk", "ntp4.npl.co.uk"}) {
		t.Fatalf("got %v %v", servers, err)
	}
}

func TestSetServersWithNoneClearsThem(t *testing.T) {
	chrony, _ := setup(t, true)
	chrony.SetServers([]string{"ntp1.npl.co.uk"})

	if err := chrony.SetServers(nil); err != nil {
		t.Fatalf("clear: %v", err)
	}
	if servers, _ := chrony.Servers(); len(servers) != 0 {
		t.Fatalf("still configured: %v", servers)
	}
}

func TestSetServersRefusesInvalidServer(t *testing.T) {
	chrony, restarts := setup(t, true)

	err := chrony.SetServers([]string{"ntp1.npl.co.uk\nsourcedir /etc/chrony"})
	if !errors.Is(err, ntp.ErrInvalidServer) {
		t.Fatalf("got %v, want ErrInvalidServer", err)
	}
	if _, statErr := os.Stat(filepath.Join(chrony.Dir, ntp.SourcesFile)); statErr == nil || *restarts != 0 {
		t.Fatal("an invalid server was written or applied")
	}
}

func TestSetServersCapsTheList(t *testing.T) {
	chrony, _ := setup(t, true)
	servers := []string{"a.example", "b.example", "c.example", "d.example", "e.example", "f.example"}
	if err := chrony.SetServers(servers); !errors.Is(err, ntp.ErrInvalidServer) {
		t.Fatalf("got %v, want ErrInvalidServer", err)
	}
}

func TestSetServersNeedsSetup(t *testing.T) {
	chrony, restarts := setup(t, false)
	if err := chrony.SetServers([]string{"ntp1.npl.co.uk"}); !errors.Is(err, ntp.ErrNotSetUp) {
		t.Fatalf("got %v, want ErrNotSetUp", err)
	}
	if *restarts != 0 {
		t.Fatal("chrony restarted without being set up")
	}
}

func TestCurrentReadsChronyc(t *testing.T) {
	chrony, _ := setup(t, true)
	script := filepath.Join(t.TempDir(), "chronyc")
	write(t, script, `#!/bin/sh
[ "$1 $2" = "-c sources" ] || exit 2
echo '^,-,prod-ntp-3.ntp1.ps5.canonical.com,2,7,377,98,0.000851234,0.000863121,0.024133421'
echo '^,*,ntp1.npl.co.uk,1,6,377,35,-0.000412345,-0.000398765,0.004121987'
echo '^,+,ntp4.npl.co.uk,1,6,377,36,0.000210000,0.000220000,0.004500000'
`)
	os.Chmod(script, 0o755)
	chrony.Chronyc = script

	current, err := chrony.Current()
	if err != nil {
		t.Fatalf("current: %v", err)
	}
	if current == nil || current.Name != "ntp1.npl.co.uk" || current.Stratum != 1 {
		t.Fatalf("got %+v, want ntp1.npl.co.uk at stratum 1", current)
	}
	if current.OffsetMS > -0.41 || current.OffsetMS < -0.42 {
		t.Fatalf("offset %v ms, want about -0.412", current.OffsetMS)
	}
}

func TestParseSelectedWithoutSync(t *testing.T) {
	if got := ntp.ParseSelected("^,?,ntp1.npl.co.uk,0,6,0,-,0.0,0.0,0.0\n"); got != nil {
		t.Fatalf("got %+v before chrony selected a source", got)
	}
}
