package main

import (
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

func (s *server) handleTtydProxy(w http.ResponseWriter, r *http.Request) {
	ns := r.URL.Query().Get("ns")
	svc := r.URL.Query().Get("service")
	if ns == "" {
		writeError(w, 400, "namespace required")
		return
	}
	if svc == "" {
		svc = "openshell"
	}
	if !strings.HasPrefix(svc, "openshell-") && svc != "openshell" {
		writeError(w, 400, "invalid service name")
		return
	}
	if sanitizeName(ns) != nil || sanitizeName(svc) != nil {
		writeError(w, 400, "invalid parameters")
		return
	}

	target, err := url.Parse(fmt.Sprintf("http://%s.%s.svc.cluster.local:7681", svc, ns))
	if err != nil {
		writeError(w, 500, "invalid target URL")
		return
	}

	proxy := &httputil.ReverseProxy{
		Director: func(req *http.Request) {
			req.URL.Scheme = target.Scheme
			req.URL.Host = target.Host
			path := r.URL.Path
			prefix := "/api/ttyd/"
			if idx := strings.Index(path, prefix); idx >= 0 {
				path = path[idx+len(prefix):]
			}
			req.URL.Path = "/" + path
			req.URL.RawQuery = ""
			req.Host = target.Host
			req.Header.Del("Authorization")
		},
	}

	if strings.Contains(strings.ToLower(r.Header.Get("Upgrade")), "websocket") {
		log.Printf("ttyd WebSocket proxy: %s -> %s", r.URL.Path, target.Host)
	}

	proxy.ServeHTTP(w, r)
}
