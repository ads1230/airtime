// Package timezone reads and changes the Pi's system time zone, which txtempus
// encodes for every standard but WWVB.
package timezone

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"slices"
	"strings"
	"time"
)

const commandTimeout = 10 * time.Second

var ErrUnknownZone = errors.New("unknown time zone")

// System drives timedatectl. That works under the unit's ProtectSystem=strict
// because systemd-timedated writes /etc/localtime, not this process.
type System struct {
	// Command is the timedatectl binary; tests point it at a stand-in.
	Command string
}

func (s System) Current() (string, error) {
	out, err := s.run("show", "--property=Timezone", "--value")
	if zone := strings.TrimSpace(out); err == nil && zone != "" {
		return zone, nil
	}

	// timedated is D-Bus activated; if it cannot be reached the symlink still says.
	target, linkErr := os.Readlink("/etc/localtime")
	if linkErr != nil {
		return "", errors.Join(err, linkErr)
	}
	if zone, ok := ZoneFromLink(target); ok {
		return zone, nil
	}
	return "", fmt.Errorf("cannot tell the time zone from /etc/localtime -> %s", target)
}

func (s System) Available() ([]string, error) {
	out, err := s.run("list-timezones")
	if err != nil {
		return nil, err
	}
	return ParseList(out), nil
}

// Set only accepts a zone timedatectl itself lists.
func (s System) Set(zone string) error {
	zones, err := s.Available()
	if err != nil {
		return err
	}
	if !slices.Contains(zones, zone) {
		return fmt.Errorf("%w %q", ErrUnknownZone, zone)
	}
	_, err = s.run("set-timezone", zone)
	return err
}

func (s System) run(args ...string) (string, error) {
	command := s.Command
	if command == "" {
		command = "timedatectl"
	}

	ctx, cancel := context.WithTimeout(context.Background(), commandTimeout)
	defer cancel()

	out, err := exec.CommandContext(ctx, command, args...).Output()
	if err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) && len(exit.Stderr) > 0 {
			return "", fmt.Errorf("timedatectl %s: %s", args[0], strings.TrimSpace(string(exit.Stderr)))
		}
		return "", fmt.Errorf("timedatectl %s: %w", args[0], err)
	}
	return string(out), nil
}

// ParseList reads `timedatectl list-timezones`, one zone per line.
func ParseList(output string) []string {
	var zones []string
	for _, line := range strings.Split(output, "\n") {
		if zone := strings.TrimSpace(line); zone != "" {
			zones = append(zones, zone)
		}
	}
	return zones
}

// ZoneFromLink names the zone /etc/localtime points at, e.g. /usr/share/zoneinfo/Europe/London.
func ZoneFromLink(target string) (string, bool) {
	_, zone, found := strings.Cut(target, "zoneinfo/")
	zone = strings.TrimPrefix(strings.TrimPrefix(zone, "posix/"), "right/")
	return zone, found && zone != ""
}
