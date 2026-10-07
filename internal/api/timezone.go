package api

import (
	"errors"
	"net/http"

	"github.com/aleh11/airtime/internal/timezone"
)

func (s *server) getTimeZone(w http.ResponseWriter, r *http.Request) {
	if s.TimeZone == nil {
		writeError(w, http.StatusServiceUnavailable, "time zone control is not configured")
		return
	}

	current, err := s.TimeZone.Current()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	available, err := s.TimeZone.Available()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"timezone": current, "available": available})
}

func (s *server) setTimeZone(w http.ResponseWriter, r *http.Request) {
	if s.TimeZone == nil {
		writeError(w, http.StatusServiceUnavailable, "time zone control is not configured")
		return
	}

	var body struct {
		TimeZone string `json:"timezone"`
	}
	if !readJSON(w, r, &body) {
		return
	}

	// txtempus reads the zone once at start, so a running broadcast would keep the old one.
	if s.Runner.Running() {
		writeError(w, http.StatusConflict, "stop the broadcast before changing the time zone")
		return
	}

	if err := s.TimeZone.Set(body.TimeZone); err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, timezone.ErrUnknownZone) {
			status = http.StatusBadRequest
		}
		writeError(w, status, err.Error())
		return
	}
	s.log.Info("time zone changed", "timezone", body.TimeZone)

	// The daemon loads its zone at startup, so schedules only follow the change after a restart.
	restarting := false
	if s.RestartService != nil {
		if err := s.RestartService(); err != nil {
			s.log.Error("restart after time zone change", "error", err)
		} else {
			restarting = true
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"timezone": body.TimeZone, "restarting": restarting})
}
