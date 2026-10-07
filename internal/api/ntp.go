package api

import (
	"errors"
	"net/http"

	"github.com/aleh11/airtime/internal/ntp"
)

func (s *server) getTimeServers(w http.ResponseWriter, r *http.Request) {
	if s.TimeServers == nil {
		writeError(w, http.StatusServiceUnavailable, "time server control is not configured")
		return
	}

	servers, err := s.TimeServers.Servers()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	response := map[string]any{
		"ready":      s.TimeServers.Ready(),
		"source_dir": s.TimeServers.SourceDir(),
		"servers":    servers,
		"current":    nil,
	}
	// chrony may be mid-restart; what is configured still stands without it.
	if current, err := s.TimeServers.Current(); err == nil && current != nil {
		response["current"] = current
	}
	writeJSON(w, http.StatusOK, response)
}

func (s *server) setTimeServers(w http.ResponseWriter, r *http.Request) {
	if s.TimeServers == nil {
		writeError(w, http.StatusServiceUnavailable, "time server control is not configured")
		return
	}

	var body struct {
		Servers []string `json:"servers"`
	}
	if !readJSON(w, r, &body) {
		return
	}

	// Restarting chrony may step the clock under a broadcast that is on air.
	if s.Runner.Running() {
		writeError(w, http.StatusConflict, "stop the broadcast before changing the time server")
		return
	}

	if err := s.TimeServers.SetServers(body.Servers); err != nil {
		status := http.StatusInternalServerError
		switch {
		case errors.Is(err, ntp.ErrInvalidServer):
			status = http.StatusBadRequest
		case errors.Is(err, ntp.ErrNotSetUp):
			status = http.StatusConflict
		}
		writeError(w, status, err.Error())
		return
	}

	servers, _ := s.TimeServers.Servers()
	s.log.Info("time servers changed", "servers", servers)
	writeJSON(w, http.StatusOK, map[string]any{"servers": servers})
}
