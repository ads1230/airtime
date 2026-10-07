// Package ntp chooses the time servers chrony keeps the Pi's clock to. AirTime
// writes them to a sources file in its own state directory, which chrony reads
// once the installer has added that directory as a sourcedir.
package ntp

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	SourcesFile = "airtime.sources"
	MaxServers  = 5

	defaultConfig  = "/etc/chrony/chrony.conf"
	commandTimeout = 5 * time.Second
)

var (
	ErrInvalidServer = errors.New("invalid time server")
	ErrNotSetUp      = errors.New("chrony is not set up to read AirTime's time servers")
)

// Chrony owns the sources file; the unit's ProtectSystem=strict keeps it out of /etc.
type Chrony struct {
	Dir        string
	ConfigFile string
	// Chronyc is the chronyc binary; tests point it at a stand-in.
	Chronyc string
	// Restart makes chronyd reread its sources. `chronyc reload sources` would
	// need write access to /run/chrony, which the unit does not grant.
	Restart func() error
}

// Source is the server chrony has selected.
type Source struct {
	Name     string  `json:"name"`
	Stratum  int     `json:"stratum"`
	OffsetMS float64 `json:"offset_ms"`
}

func (c Chrony) SourceDir() string { return c.Dir }

// Ready reports whether chrony's configuration names Dir as a sourcedir.
func (c Chrony) Ready() bool {
	config := c.ConfigFile
	if config == "" {
		config = defaultConfig
	}

	sourcedirs, confdirs := scanConfig(config)
	for _, confdir := range confdirs {
		files, _ := filepath.Glob(filepath.Join(confdir, "*.conf"))
		for _, file := range files {
			found, _ := scanConfig(file)
			sourcedirs = append(sourcedirs, found...)
		}
	}

	for _, dir := range sourcedirs {
		if filepath.Clean(dir) == filepath.Clean(c.Dir) {
			return true
		}
	}
	return false
}

func scanConfig(path string) (sourcedirs, confdirs []string) {
	file, err := os.Open(path)
	if err != nil {
		return nil, nil
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 2 {
			continue
		}
		switch fields[0] {
		case "sourcedir":
			sourcedirs = append(sourcedirs, fields[1])
		case "confdir":
			confdirs = append(confdirs, fields[1:]...)
		}
	}
	return sourcedirs, confdirs
}

func (c Chrony) Servers() ([]string, error) {
	data, err := os.ReadFile(filepath.Join(c.Dir, SourcesFile))
	if errors.Is(err, os.ErrNotExist) {
		return []string{}, nil
	}
	if err != nil {
		return nil, err
	}
	return ParseServers(string(data)), nil
}

// SetServers replaces AirTime's servers; none leaves chrony on its own defaults.
func (c Chrony) SetServers(servers []string) error {
	var lines []string
	seen := map[string]bool{}
	for _, server := range servers {
		server = strings.ToLower(strings.TrimSpace(server))
		if server == "" || seen[server] {
			continue
		}
		if !ValidServer(server) {
			return fmt.Errorf("%w %q", ErrInvalidServer, server)
		}
		seen[server] = true
		lines = append(lines, SourcesLine(server))
	}
	if len(lines) > MaxServers {
		return fmt.Errorf("%w: at most %d servers", ErrInvalidServer, MaxServers)
	}
	if !c.Ready() {
		return ErrNotSetUp
	}

	content := "# Written by AirTime from the dashboard; changes here are overwritten.\n" + strings.Join(lines, "\n")
	if len(lines) > 0 {
		content += "\n"
	}
	if err := writeAtomically(filepath.Join(c.Dir, SourcesFile), content); err != nil {
		return err
	}

	if c.Restart == nil {
		return nil
	}
	return c.Restart()
}

func writeAtomically(path, content string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	temp := path + ".tmp"
	if err := os.WriteFile(temp, []byte(content), 0o644); err != nil {
		return err
	}
	return os.Rename(temp, path)
}

// Current asks chrony which source it is synced to; nil when it has none yet.
func (c Chrony) Current() (*Source, error) {
	command := c.Chronyc
	if command == "" {
		command = "chronyc"
	}
	ctx, cancel := context.WithTimeout(context.Background(), commandTimeout)
	defer cancel()

	out, err := exec.CommandContext(ctx, command, "-c", "sources").Output()
	if err != nil {
		return nil, fmt.Errorf("chronyc sources: %w", err)
	}
	return ParseSelected(string(out)), nil
}

var hostLabel = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`)

// ValidServer accepts an IP address or a DNS name, and nothing that could
// smuggle another directive into chrony's configuration.
func ValidServer(server string) bool {
	if net.ParseIP(server) != nil {
		return true
	}
	if server == "" || len(server) > 253 {
		return false
	}
	for _, label := range strings.Split(strings.ToLower(server), ".") {
		if !hostLabel.MatchString(label) {
			return false
		}
	}
	return true
}

// SourcesLine renders one server. Pool names get the pool directive, so chrony
// uses several of their addresses. NIST refuses clients that poll faster than
// every 4 seconds, which iburst does, so its servers go without.
func SourcesLine(server string) string {
	directive := "server"
	if server == "pool.ntp.org" || strings.HasSuffix(server, ".pool.ntp.org") {
		directive = "pool"
	}
	options := "iburst prefer"
	if strings.HasSuffix(server, ".nist.gov") {
		options = "prefer"
	}
	return fmt.Sprintf("%s %s %s", directive, server, options)
}

// ParseServers reads the hosts back out of a sources file.
func ParseServers(content string) []string {
	servers := []string{}
	for _, line := range strings.Split(content, "\n") {
		fields := strings.Fields(line)
		if len(fields) >= 2 && (fields[0] == "server" || fields[0] == "pool") {
			servers = append(servers, fields[1])
		}
	}
	return servers
}

// ParseSelected reads `chronyc -c sources`, whose fields are mode, state, name,
// stratum, poll, reach, last rx, adjusted offset, measured offset and error.
func ParseSelected(output string) *Source {
	for _, line := range strings.Split(output, "\n") {
		fields := strings.Split(strings.TrimSpace(line), ",")
		if len(fields) < 8 || fields[1] != "*" {
			continue
		}
		stratum, _ := strconv.Atoi(fields[3])
		offset, _ := strconv.ParseFloat(fields[7], 64)
		return &Source{Name: fields[2], Stratum: stratum, OffsetMS: offset * 1000}
	}
	return nil
}
