package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

var sandboxTemplateGVR = schema.GroupVersionResource{
	Group:    "extensions.agents.x-k8s.io",
	Version:  "v1beta1",
	Resource: "sandboxtemplates",
}

var warmPoolGVR = schema.GroupVersionResource{
	Group:    "extensions.agents.x-k8s.io",
	Version:  "v1beta1",
	Resource: "sandboxwarmpools",
}

var sandboxGVR = schema.GroupVersionResource{
	Group:    "agents.x-k8s.io",
	Version:  "v1beta1",
	Resource: "sandboxes",
}

func (s *server) userClients(r *http.Request) (kubernetes.Interface, dynamic.Interface, *rest.Config, error) {
	client, dynClient, err := clientFromRequest(r, s.baseConfig)
	if err != nil {
		return s.client, s.dynClient, s.baseConfig, nil
	}
	cfg := rest.CopyConfig(s.baseConfig)
	token := r.Header.Get("Authorization")
	if strings.HasPrefix(token, "Bearer ") {
		token = token[7:]
	}
	cfg.BearerToken = token
	cfg.BearerTokenFile = ""
	return client, dynClient, cfg, nil
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func (s *server) handleNamespaces(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, 405, "method not allowed")
		return
	}

	userClient, _, err := clientFromRequest(r, s.baseConfig)
	if err != nil {
		writeError(w, 401, "unauthorized")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	_, userDyn, _, err := s.userClients(r)
	if err != nil {
		writeError(w, 401, "unauthorized")
		return
	}

	projectGVR := schema.GroupVersionResource{
		Group:    "project.openshift.io",
		Version:  "v1",
		Resource: "projects",
	}
	projects, err := userDyn.Resource(projectGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		nsList, nsErr := userClient.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
		if nsErr != nil {
			writeError(w, 500, fmt.Sprintf("failed to list projects: %v", err))
			return
		}
		type nsInfo struct {
			Name   string `json:"name"`
			Status string `json:"status"`
		}
		result := make([]nsInfo, 0, len(nsList.Items))
		for _, ns := range nsList.Items {
			result = append(result, nsInfo{Name: ns.Name, Status: string(ns.Status.Phase)})
		}
		writeJSON(w, result)
		return
	}

	type nsInfo struct {
		Name   string `json:"name"`
		Status string `json:"status"`
	}

	result := make([]nsInfo, 0, len(projects.Items))
	for _, p := range projects.Items {
		status := "Active"
		if s, ok := p.Object["status"].(map[string]interface{}); ok {
			if ph, ok := s["phase"].(string); ok {
				status = ph
			}
		}
		result = append(result, nsInfo{Name: p.GetName(), Status: status})
	}

	writeJSON(w, result)
}

func (s *server) handleAgentTypes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, 405, "method not allowed")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	list, err := s.dynClient.Resource(sandboxTemplateGVR).List(ctx, metav1.ListOptions{})
	if err != nil {
		log.Printf("failed to list SandboxTemplates: %v", err)
		writeJSON(w, []interface{}{})
		return
	}

	type agentType struct {
		Name        string `json:"name"`
		DisplayName string `json:"displayName"`
		Description string `json:"description"`
		Image       string `json:"image"`
	}

	result := make([]agentType, 0, len(list.Items))
	for _, item := range list.Items {
		name := item.GetName()
		displayName := name
		description := ""
		image := ""

		annotations := item.GetAnnotations()
		if annotations != nil {
			if dn, ok := annotations["openshell.nvidia.com/display-name"]; ok {
				displayName = dn
			}
			if desc, ok := annotations["openshell.nvidia.com/description"]; ok {
				description = desc
			}
		}

		spec, ok := item.Object["spec"].(map[string]interface{})
		if ok {
			if tmpl, ok := spec["template"].(map[string]interface{}); ok {
				if specInner, ok := tmpl["spec"].(map[string]interface{}); ok {
					if containers, ok := specInner["containers"].([]interface{}); ok && len(containers) > 0 {
						if c, ok := containers[0].(map[string]interface{}); ok {
							if img, ok := c["image"].(string); ok {
								image = img
							}
						}
					}
				}
			}
		}

		result = append(result, agentType{
			Name:        name,
			DisplayName: displayName,
			Description: description,
			Image:       image,
		})
	}

	writeJSON(w, result)
}

func (s *server) handleProviders(w http.ResponseWriter, r *http.Request) {
	ns := r.URL.Query().Get("ns")

	switch r.Method {
	case http.MethodGet:
		if ns == "" {
			writeError(w, 400, "namespace required")
			return
		}
		output, err := execInGateway(r.Context(), s.client, s.baseConfig, ns, "openshell provider list --output json")
		if err != nil {
			log.Printf("failed to list providers: %v", err)
			writeJSON(w, []interface{}{})
			return
		}

		var providers []interface{}
		if err := json.Unmarshal([]byte(output), &providers); err != nil {
			writeJSON(w, []interface{}{})
			return
		}
		writeJSON(w, providers)

	case http.MethodPost:
		var req struct {
			Name        string            `json:"name"`
			Type        string            `json:"type"`
			Credentials map[string]string `json:"credentials"`
			Namespace   string            `json:"namespace"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, 400, "invalid request body")
			return
		}

		configKeys := map[string]bool{
			"VERTEX_AI_PROJECT_ID": true,
			"VERTEX_AI_REGION":     true,
			"OPENAI_BASE_URL":      true,
			"BASE_URL":             true,
		}

		// For Google Vertex AI with ADC JSON, write the file first then use --from-gcloud-adc
		if req.Type == "google-vertex-ai" {
			adcJSON := ""
			for k, v := range req.Credentials {
				if k == "GOOGLE_APPLICATION_CREDENTIALS_JSON" {
					adcJSON = v
				}
			}
			if adcJSON != "" {
				escaped := strings.ReplaceAll(adcJSON, "'", "'\\''")
				writeCmd := fmt.Sprintf("mkdir -p /tmp/.config/gcloud && cat > /tmp/.config/gcloud/application_default_credentials.json << 'ADCEOF'\n%s\nADCEOF", escaped)
				_, _ = execInGateway(r.Context(), s.client, s.baseConfig, req.Namespace, writeCmd)
			}

			args := fmt.Sprintf("openshell provider create --name %s --type %s --from-gcloud-adc", req.Name, req.Type)
			for k, v := range req.Credentials {
				if configKeys[k] {
					esc := strings.ReplaceAll(v, "'", "'\\''")
					args += fmt.Sprintf(" --config %s='%s'", k, esc)
				}
			}

			_, err := execInGateway(r.Context(), s.client, s.baseConfig, req.Namespace, args)
			if err != nil {
				writeError(w, 500, fmt.Sprintf("failed to create provider: %v", err))
				return
			}
			writeJSON(w, map[string]string{"status": "created", "name": req.Name})
			return
		}

		args := fmt.Sprintf("openshell provider create --name %s --type %s", req.Name, req.Type)
		hasCredential := false
		for k, v := range req.Credentials {
			escaped := strings.ReplaceAll(v, "'", "'\\''")
			if configKeys[k] {
				args += fmt.Sprintf(" --config %s='%s'", k, escaped)
			} else {
				args += fmt.Sprintf(" --credential %s='%s'", k, escaped)
				hasCredential = true
			}
		}
		if !hasCredential {
			args += " --from-gcloud-adc"
		}

		_, err := execInGateway(r.Context(), s.client, s.baseConfig, req.Namespace, args)
		if err != nil {
			writeError(w, 500, fmt.Sprintf("failed to create provider: %v", err))
			return
		}
		writeJSON(w, map[string]string{"status": "created", "name": req.Name})

	case http.MethodDelete:
		name := r.URL.Query().Get("name")
		if ns == "" || name == "" {
			writeError(w, 400, "namespace and name required")
			return
		}
		cmd := fmt.Sprintf("openshell provider delete %s", name)
		_, err := execInGateway(r.Context(), s.client, s.baseConfig, ns, cmd)
		if err != nil {
			writeError(w, 500, fmt.Sprintf("failed to delete provider: %v", err))
			return
		}
		writeJSON(w, map[string]string{"status": "deleted", "name": name})

	default:
		writeError(w, 405, "method not allowed")
	}
}

func (s *server) handleWarmPools(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, 405, "method not allowed")
		return
	}

	ns := r.URL.Query().Get("ns")
	if ns == "" {
		writeError(w, 400, "namespace required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	list, err := s.dynClient.Resource(warmPoolGVR).Namespace(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		log.Printf("failed to list warm pools: %v", err)
		writeJSON(w, []interface{}{})
		return
	}

	type poolInfo struct {
		Name      string `json:"name"`
		Replicas  int64  `json:"replicas"`
		Available int64  `json:"available"`
		Template  string `json:"template"`
	}

	result := make([]poolInfo, 0, len(list.Items))
	for _, item := range list.Items {
		replicas := int64(0)
		available := int64(0)
		template := ""

		spec, ok := item.Object["spec"].(map[string]interface{})
		if ok {
			if r, ok := spec["replicas"].(int64); ok {
				replicas = r
			}
			if t, ok := spec["templateRef"].(string); ok {
				template = t
			}
		}

		status, ok := item.Object["status"].(map[string]interface{})
		if ok {
			if a, ok := status["availableReplicas"].(int64); ok {
				available = a
			}
		}

		result = append(result, poolInfo{
			Name:      item.GetName(),
			Replicas:  replicas,
			Available: available,
			Template:  template,
		})
	}

	writeJSON(w, result)
}

func (s *server) handleAgents(w http.ResponseWriter, r *http.Request) {
	ns := r.URL.Query().Get("ns")
	if ns == "" {
		writeError(w, 400, "namespace required")
		return
	}

	if r.Method != http.MethodGet {
		writeError(w, 405, "method not allowed")
		return
	}

	_, userDynClient, _, _ := s.userClients(r)

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	// Get inference provider name for display
	inferProvider := ""
	if out, err := execInGateway(ctx, s.client, s.baseConfig, ns, "openshell inference get"); err == nil {
		for _, line := range strings.Split(out, "\n") {
			cleaned := strings.ReplaceAll(line, "\x1b[2m", "")
			cleaned = strings.ReplaceAll(cleaned, "\x1b[0m", "")
			cleaned = strings.TrimSpace(cleaned)
			if strings.HasPrefix(cleaned, "Provider:") {
				inferProvider = strings.TrimSpace(strings.TrimPrefix(cleaned, "Provider:"))
				break
			}
		}
	}

	list, err := userDynClient.Resource(sandboxGVR).Namespace(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		log.Printf("failed to list sandbox claims: %v", err)
		writeJSON(w, []interface{}{})
		return
	}

	type agentInfo struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
		AgentType string `json:"agentType"`
		Status    string `json:"status"`
		Sandbox   string `json:"sandbox"`
		Provider  string `json:"provider"`
		Age       string `json:"age"`
	}

	result := make([]agentInfo, 0, len(list.Items))
	for _, item := range list.Items {
		agentType := ""
		status := "Pending"
		sandbox := item.GetName()
		provider := inferProvider

		labels := item.GetLabels()
		if labels != nil {
			if at, ok := labels["openshell.ai/agent-type"]; ok {
				agentType = at
			}
			if p, ok := labels["openshell.ai/provider"]; ok {
				provider = p
			}
		}

		// Extract agent type from container image if not in labels
		if agentType == "" {
			if spec, ok := item.Object["spec"].(map[string]interface{}); ok {
				if pt, ok := spec["podTemplate"].(map[string]interface{}); ok {
					if ps, ok := pt["spec"].(map[string]interface{}); ok {
						if containers, ok := ps["containers"].([]interface{}); ok && len(containers) > 0 {
							if c, ok := containers[0].(map[string]interface{}); ok {
								if img, ok := c["image"].(string); ok {
									parts := strings.Split(img, "/")
									last := parts[len(parts)-1]
									agentType = strings.Split(last, ":")[0]
								}
							}
						}
					}
				}
			}
		}

		statusObj, ok := item.Object["status"].(map[string]interface{})
		if ok {
			if conditions, ok := statusObj["conditions"].([]interface{}); ok {
				for _, cond := range conditions {
					if c, ok := cond.(map[string]interface{}); ok {
						if c["type"] == "Ready" {
							if c["status"] == "True" {
								status = "Running"
							} else {
								status = "Pending"
							}
						}
					}
				}
			}
		}

		age := time.Since(item.GetCreationTimestamp().Time).Truncate(time.Second).String()

		result = append(result, agentInfo{
			Name:      item.GetName(),
			Namespace: ns,
			AgentType: agentType,
			Status:    status,
			Sandbox:   sandbox,
			Provider:  provider,
			Age:       age,
		})
	}

	writeJSON(w, result)
}

func (s *server) handleAgentActions(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	ns := r.URL.Query().Get("ns")

	if strings.HasSuffix(path, "/pod") {
		name := strings.TrimPrefix(path, "/api/agents/")
		name = strings.TrimSuffix(name, "/pod")
		s.handleAgentPod(w, r, name, ns)
		return
	}

	if r.Method == http.MethodDelete {
		name := strings.TrimPrefix(path, "/api/agents/")
		name = strings.Split(name, "?")[0]
		s.handleDeleteAgent(w, r, name, ns)
		return
	}

	writeError(w, 404, "not found")
}

func (s *server) handleAgentPod(w http.ResponseWriter, r *http.Request, name, ns string) {
	if ns == "" {
		writeError(w, 400, "namespace required")
		return
	}

	userClient, _, _, _ := s.userClients(r)

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	pod, err := userClient.CoreV1().Pods(ns).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		writeError(w, 404, fmt.Sprintf("no pod found for sandbox %s", name))
		return
	}

	containerName := "agent"
	for _, c := range pod.Spec.Containers {
		if c.Name == "agent" {
			containerName = "agent"
			break
		}
	}

	writeJSON(w, map[string]string{
		"podName":       pod.Name,
		"containerName": containerName,
		"status":        string(pod.Status.Phase),
	})
}

func (s *server) handleDeleteAgent(w http.ResponseWriter, r *http.Request, name, ns string) {
	if ns == "" {
		writeError(w, 400, "namespace required")
		return
	}

	cmd := fmt.Sprintf("openshell sandbox delete %s", name)
	_, err := execInGateway(r.Context(), s.client, s.baseConfig, ns, cmd)
	if err != nil {
		writeError(w, 500, fmt.Sprintf("failed to delete sandbox: %v", err))
		return
	}

	writeJSON(w, map[string]string{"status": "deleted"})
}

func (s *server) handleDeploy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, 405, "method not allowed")
		return
	}

	var req struct {
		Namespace string `json:"namespace"`
		AgentType string `json:"agentType"`
		Provider  string `json:"provider"`
		WarmPool  string `json:"warmPool"`
		Count     int    `json:"count"`
		Model     string `json:"model"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, 400, "invalid request body")
		return
	}

	if req.Count < 1 {
		req.Count = 1
	}
	if req.Count > 10 {
		req.Count = 10
	}

	ctx := r.Context()

	// Enable providers v2
	_, err := execInGateway(ctx, s.client, s.baseConfig, req.Namespace,
		"openshell settings set --global --key providers_v2_enabled --value true --yes")
	if err != nil {
		log.Printf("warning: failed to enable providers_v2: %v", err)
	}

	// Set inference provider and model
	if req.Provider != "" {
		inferCmd := fmt.Sprintf("openshell inference set --provider %s --no-verify", req.Provider)
		if req.Model != "" {
			inferCmd += fmt.Sprintf(" --model %s", req.Model)
		} else {
			inferCmd += " --model claude-sonnet-4-6"
		}
		_, err = execInGateway(ctx, s.client, s.baseConfig, req.Namespace, inferCmd)
		if err != nil {
			log.Printf("warning: failed to set inference: %v", err)
		}
	}

	// Create sandboxes with unique names (k8s-style random suffix)
	randSuffix := func() string {
		const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
		b := make([]byte, 5)
		for i := range b {
			b[i] = chars[time.Now().UnixNano()%int64(len(chars))]
			time.Sleep(time.Nanosecond)
		}
		return string(b)
	}
	sandboxes := make([]string, 0, req.Count)
	for i := 1; i <= req.Count; i++ {
		name := fmt.Sprintf("sandbox-%s", randSuffix())

		createCmd := fmt.Sprintf("openshell sandbox create --name %s", name)
		if req.AgentType != "" {
			createCmd += fmt.Sprintf(" --from %s", req.AgentType)
		}
		if req.WarmPool != "" {
			createCmd += fmt.Sprintf(" --warm-pool %s", req.WarmPool)
		}

		_, err := execInGateway(ctx, s.client, s.baseConfig, req.Namespace, createCmd)
		if err != nil {
			writeError(w, 500, fmt.Sprintf("failed to create sandbox %s: %v", name, err))
			return
		}
		sandboxes = append(sandboxes, name)
	}

	writeJSON(w, map[string]interface{}{
		"status":    "deployed",
		"namespace": req.Namespace,
		"sandboxes": sandboxes,
	})
}

func (s *server) handleGatewayPod(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, 405, "method not allowed")
		return
	}

	ns := r.URL.Query().Get("ns")
	if ns == "" {
		writeError(w, 400, "namespace required")
		return
	}

	userClient, _, _, _ := s.userClients(r)

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	pods, err := userClient.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{
		LabelSelector: "app=openshell",
	})
	if err != nil || len(pods.Items) == 0 {
		pods2, err2 := userClient.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
		if err2 != nil {
			writeError(w, 404, "no gateway pod found")
			return
		}
		for _, pod := range pods2.Items {
			if strings.HasPrefix(pod.Name, "openshell-") {
				writeJSON(w, map[string]string{
					"podName":       pod.Name,
					"containerName": "openshell-cli",
					"status":        string(pod.Status.Phase),
				})
				return
			}
		}
		writeError(w, 404, "no gateway pod found")
		return
	}

	pod := pods.Items[0]

	writeJSON(w, map[string]string{
		"podName":       pod.Name,
		"containerName": "openshell-cli",
		"status":        string(pod.Status.Phase),
	})
}
