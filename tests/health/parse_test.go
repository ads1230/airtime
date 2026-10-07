package health_test

import (
	"testing"

	"github.com/aleh11/airtime/internal/health"
)

const sourcesSample = `MS Name/IP address         Stratum Poll Reach LastRx Last sample
===============================================================================
^* 162.159.200.1                 3   6   377    31   +12us[  +14us] +/-   11ms
^- 85.199.214.100                1   6   377   999   -1ms[  -1ms] +/-   22ms
`

func TestNTPPicksTheMostRecentlyHeardSource(t *testing.T) {
	got := health.ParseChronySources(sourcesSample)

	if !got.Synced {
		t.Fatal("got not synced, want synced")
	}
	if got.Server != "162.159.200.1" {
		t.Fatalf("got %q, want the freshest source", got.Server)
	}
	if got.LastRxSeconds != 31 {
		t.Fatalf("got %v, want 31", got.LastRxSeconds)
	}
	// 31s falls in the 20-40 band.
	if got.Score != 0.5 {
		t.Fatalf("got score %v, want 0.5", got.Score)
	}
}

func TestNTPReadsTheOffsetOfTheSelectedSource(t *testing.T) {
	// The offset comes from the source marked *, the one chrony follows, even
	// when another was heard from more recently.
	const sample = `MS Name/IP address         Stratum Poll Reach LastRx Last sample
===============================================================================
^- 85.199.214.100                1   6   377     5   -900us[ -900us] +/-   22ms
^* 162.159.200.1                 3   6   377    31   +12us[  +14us] +/-   11ms
`
	got := health.ParseChronySources(sample)

	if got.Server != "85.199.214.100" || got.LastRxSeconds != 5 {
		t.Fatalf("got %q at %vs, want the freshest source for the sync age", got.Server, got.LastRxSeconds)
	}
	if got.OffsetMS == nil {
		t.Fatal("got no offset, want the selected source's")
	}
	if diff := *got.OffsetMS - 0.012; diff > 1e-9 || diff < -1e-9 {
		t.Fatalf("got %v ms, want 0.012", *got.OffsetMS)
	}
}

func TestNTPOffsetUnits(t *testing.T) {
	cases := []struct {
		sample string
		want   float64
	}{
		{"+567ns[ +600ns] +/-  100us", 0.000567},
		{"-1234us[-1250us] +/-    5ms", -1.234},
		{"+3ms[   +3ms] +/-   40ms", 3},
		{"-2s[    -2s] +/-  120ms", -2000},
	}
	for _, tc := range cases {
		output := "MS Name/IP address         Stratum Poll Reach LastRx Last sample\n" +
			"===============================================================================\n" +
			"^* 192.0.2.1                     2   6   377    10   " + tc.sample + "\n"
		got := health.ParseChronySources(output)
		if got.OffsetMS == nil {
			t.Fatalf("%q: got no offset", tc.sample)
		}
		if diff := *got.OffsetMS - tc.want; diff > 1e-9 || diff < -1e-9 {
			t.Fatalf("%q: got %v ms, want %v", tc.sample, *got.OffsetMS, tc.want)
		}
	}
}

func TestNTPOffsetIsUnknownUntilASourceIsSelected(t *testing.T) {
	const sample = `MS Name/IP address         Stratum Poll Reach LastRx Last sample
===============================================================================
^? 162.159.200.1                 3   6     1     3   +12us[  +14us] +/-   11ms
^+ 85.199.214.100                1   6   377    20   -1ms[  -1ms] +/-   22ms
`
	got := health.ParseChronySources(sample)
	if !got.Synced {
		t.Fatal("got not synced, want sources heard from")
	}
	if got.OffsetMS != nil {
		t.Fatalf("got %v ms, want no offset without a selected source", *got.OffsetMS)
	}
}

func TestNTPWithNoUsableSources(t *testing.T) {
	got := health.ParseChronySources("MS Name/IP address\n====\n")
	if got.Synced {
		t.Fatalf("got %+v, want not synced", got)
	}
	if got.Score != 0 {
		t.Fatalf("got score %v, want 0", got.Score)
	}
}

func TestNTPScoreBands(t *testing.T) {
	cases := []struct {
		lastRx float64
		want   float64
	}{{10, 0.1}, {30, 0.5}, {50, 1.0}, {80, 3.0}, {300, 5.0}, {600, 10.0}, {2000, 0}}
	for _, tc := range cases {
		if got := health.NTPScore(tc.lastRx); got != tc.want {
			t.Fatalf("lastRx %v: got %v, want %v", tc.lastRx, got, tc.want)
		}
	}
}

func TestPingLatencyIsRead(t *testing.T) {
	const output = `PING 1.1.1.1 (1.1.1.1) 56(84) bytes of data.
64 bytes from 1.1.1.1: icmp_seq=1 ttl=57 time=14.2 ms

--- 1.1.1.1 ping statistics ---
1 packets transmitted, 1 received, 0% packet loss, time 0ms
rtt min/avg/max/mdev = 14.234/14.234/14.234/0.000 ms
`
	got := health.ParsePing(output)
	if !got.Connected {
		t.Fatal("got disconnected, want connected")
	}
	if got.LatencyMS < 14.1 || got.LatencyMS > 14.3 {
		t.Fatalf("got %v, want ~14.2", got.LatencyMS)
	}
	if got.Score != 0.1 {
		t.Fatalf("got score %v, want 0.1", got.Score)
	}
}

func TestPingWithNoReply(t *testing.T) {
	got := health.ParsePing("1 packets transmitted, 0 received, 100% packet loss\n")
	if got.Connected {
		t.Fatalf("got %+v, want disconnected", got)
	}
}
