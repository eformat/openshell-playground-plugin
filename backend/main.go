package main

import (
	"crypto/tls"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

type server struct {
	client    kubernetes.Interface
	dynClient dynamic.Interface
}

func buildConfig() (*rest.Config, error) {
	tokenPath := os.Getenv("KUBE_SA_TOKEN_PATH")
	caPath := os.Getenv("KUBE_SA_CA_PATH")

	if tokenPath != "" {
		if _, err := os.Stat(tokenPath); err == nil {
			host := os.Getenv("KUBERNETES_SERVICE_HOST")
			port := os.Getenv("KUBERNETES_SERVICE_PORT")
			if host != "" && port != "" {
				return &rest.Config{
					Host:            "https://" + host + ":" + port,
					BearerTokenFile: tokenPath,
					TLSClientConfig: rest.TLSClientConfig{
						CAFile: caPath,
					},
				}, nil
			}
		}
	}

	config, err := rest.InClusterConfig()
	if err == nil {
		return config, nil
	}

	kubeconfig := filepath.Join(os.Getenv("HOME"), ".kube", "config")
	return clientcmd.BuildConfigFromFlags("", kubeconfig)
}

func main() {
	config, err := buildConfig()
	if err != nil {
		log.Fatalf("failed to create k8s config: %v", err)
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		log.Fatalf("failed to create k8s client: %v", err)
	}

	dynClient, err := dynamic.NewForConfig(config)
	if err != nil {
		log.Fatalf("failed to create dynamic client: %v", err)
	}

	s := &server{
		client:    clientset,
		dynClient: dynClient,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})
	mux.HandleFunc("/api/namespaces", s.handleNamespaces)
	mux.HandleFunc("/api/agent-types", s.handleAgentTypes)
	mux.HandleFunc("/api/providers", s.handleProviders)
	mux.HandleFunc("/api/warmpools", s.handleWarmPools)
	mux.HandleFunc("/api/agents", s.handleAgents)
	mux.HandleFunc("/api/agents/", s.handleAgentActions)
	mux.HandleFunc("/api/deploy", s.handleDeploy)
	mux.HandleFunc("/api/gateway/pod", s.handleGatewayPod)

	distDir := os.Getenv("PLUGIN_DIST_DIR")
	if distDir == "" {
		distDir = "/app/dist"
	}
	mux.Handle("/", http.FileServer(http.Dir(distDir)))

	certFile := os.Getenv("TLS_CERT_FILE")
	keyFile := os.Getenv("TLS_KEY_FILE")
	if certFile == "" {
		certFile = "/var/serving-cert/tls.crt"
	}
	if keyFile == "" {
		keyFile = "/var/serving-cert/tls.key"
	}

	addr := ":9443"
	log.Printf("starting server on %s", addr)

	if _, err := os.Stat(certFile); os.IsNotExist(err) {
		log.Printf("TLS cert not found, starting HTTP server for development")
		log.Fatal(http.ListenAndServe(addr, mux))
	} else {
		tlsConfig := &tls.Config{
			MinVersion: tls.VersionTLS12,
		}
		srv := &http.Server{
			Addr:      addr,
			Handler:   mux,
			TLSConfig: tlsConfig,
		}
		log.Fatal(srv.ListenAndServeTLS(certFile, keyFile))
	}
}
