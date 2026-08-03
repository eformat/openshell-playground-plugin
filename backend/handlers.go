package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	authenticationv1 "k8s.io/api/authentication/v1"
	authorizationv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
)

var safeNameRegex = regexp.MustCompile(`^[a-zA-Z0-9._-]+$`)

func sanitizeName(s string) error {
	if s == "" || !safeNameRegex.MatchString(s) {
		return fmt.Errorf("invalid name: must match [a-zA-Z0-9._-]+")
	}
	return nil
}

func sanitizeImageRef(s string) error {
	if s == "" {
		return nil
	}
	ok := regexp.MustCompile(`^[a-zA-Z0-9._:/@-]+$`).MatchString(s)
	if !ok {
		return fmt.Errorf("invalid image reference")
	}
	return nil
}

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

func (s *server) userClients(r *http.Request) (kubernetes.Interface, dynamic.Interface, error) {
	client, dynClient, err := clientFromRequest(r, s.baseConfig)
	if err != nil {
		return nil, nil, fmt.Errorf("unauthorized: %w", err)
	}
	return client, dynClient, nil
}

func (s *server) authorizeNamespace(r *http.Request, namespace string) error {
	token := r.Header.Get("Authorization")
	if strings.HasPrefix(token, "Bearer ") {
		token = token[7:]
	}
	if token == "" {
		return fmt.Errorf("unauthorized")
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// TokenReview: validate token and get username/groups
	tr, err := s.client.AuthenticationV1().TokenReviews().Create(ctx, &authenticationv1.TokenReview{
		Spec: authenticationv1.TokenReviewSpec{Token: token},
	}, metav1.CreateOptions{})
	if err != nil || !tr.Status.Authenticated {
		return fmt.Errorf("unauthorized")
	}

	// SubjectAccessReview: check if user can create pods in this namespace (implies edit/admin)
	sar, err := s.client.AuthorizationV1().SubjectAccessReviews().Create(ctx, &authorizationv1.SubjectAccessReview{
		Spec: authorizationv1.SubjectAccessReviewSpec{
			User:   tr.Status.User.Username,
			Groups: tr.Status.User.Groups,
			ResourceAttributes: &authorizationv1.ResourceAttributes{
				Namespace: namespace,
				Verb:      "create",
				Group:     "",
				Resource:  "pods",
			},
		},
	}, metav1.CreateOptions{})
	if err != nil || !sar.Status.Allowed {
		return fmt.Errorf("access denied: user %s cannot create resources in namespace %s", tr.Status.User.Username, namespace)
	}
	return nil
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

	_, userDyn, err := s.userClients(r)
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

// execOnGateway executes a command in the singleton gateway pod.
// In workspace architecture, the gateway parameter is now the workspace name
// and is prepended to commands as --workspace {workspace}.
func (s *server) execOnGateway(ctx context.Context, ns, _ /*workspace*/, command string) (string, error) {
	return execInGateway(ctx, s.client, s.baseConfig, ns, command)
}

// execOnWorkspace executes a workspace-scoped openshell command.
func (s *server) execOnWorkspace(ctx context.Context, ns, workspace, command string) (string, error) {
	var cmd string
	if workspace != "" {
		cmd = fmt.Sprintf("openshell --workspace %s %s", workspace, command)
	} else {
		cmd = fmt.Sprintf("openshell %s", command)
	}
	return execInGateway(ctx, s.client, s.baseConfig, ns, cmd)
}

func (s *server) handleProviders(w http.ResponseWriter, r *http.Request) {
	ns := r.URL.Query().Get("ns")
	gw := r.URL.Query().Get("gateway")

	switch r.Method {
	case http.MethodGet:
		if ns == "" {
			writeError(w, 400, "namespace required")
			return
		}
		output, err := s.execOnWorkspace(r.Context(), ns, gw, "provider list --output json")
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
			Gateway     string            `json:"gateway"`
			Credentials map[string]string `json:"credentials"`
			Namespace   string            `json:"namespace"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, 400, "invalid request body")
			return
		}
		if err := sanitizeName(req.Name); err != nil {
			writeError(w, 400, fmt.Sprintf("invalid provider name: %v", err))
			return
		}
		if err := sanitizeName(req.Type); err != nil {
			writeError(w, 400, fmt.Sprintf("invalid provider type: %v", err))
			return
		}
		for k := range req.Credentials {
			if err := sanitizeName(k); err != nil {
				writeError(w, 400, fmt.Sprintf("invalid credential key: %v", err))
				return
			}
		}
		if err := s.authorizeNamespace(r, req.Namespace); err != nil {
			writeError(w, 403, err.Error())
			return
		}

		configKeys := map[string]bool{
			"VERTEX_AI_PROJECT_ID": true,
			"VERTEX_AI_REGION":     true,
			"OPENAI_BASE_URL":      true,
			"BASE_URL":             true,
			"ANTHROPIC_BASE_URL":   true, // config key for anthropic-openai provider
		}

		// MaaS (Anthropic-compatible): use the native anthropic-openai provider type
		// which uses AuthHeader::Bearer + ANTHROPIC_AUTH_TOKEN.
		isAnthropicOpenAI := req.Type == "anthropic-openai"
		// type stays as "anthropic-openai" — now a first-class provider type in the gateway

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
				_, _ = s.execOnGateway(r.Context(), req.Namespace, req.Gateway, writeCmd)
			}

			args := fmt.Sprintf("provider create --name %s --type %s --from-gcloud-adc", req.Name, req.Type)
			for k, v := range req.Credentials {
				if configKeys[k] {
					esc := strings.ReplaceAll(v, "'", "'\\''")
					args += fmt.Sprintf(" --config %s='%s'", k, esc)
				}
			}

			_, err := s.execOnWorkspace(r.Context(), req.Namespace, req.Gateway, args)
			if err != nil {
				writeError(w, 500, fmt.Sprintf("failed to create provider: %v", err))
				return
			}
			writeJSON(w, map[string]string{"status": "created", "name": req.Name})
			return
		}

		args := fmt.Sprintf("provider create --name %s --type %s", req.Name, req.Type)
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

		_, err := s.execOnWorkspace(r.Context(), req.Namespace, req.Gateway, args)
		if err != nil {
			writeError(w, 500, fmt.Sprintf("failed to create provider: %v", err))
			return
		}

		// Import the claude-code-maas provider profile so the providers v2 system
		// can inject ANTHROPIC_AUTH_TOKEN (bearer) and ANTHROPIC_BASE_URL into
		// the sandbox environment when --provider <name> is used at sandbox create time.
		if isAnthropicOpenAI {
			profileYAML := `id: claude-code-maas
display_name: Claude Code (Anthropic OpenAI-compatible)
description: Claude Code with bearer token auth for Anthropic-compatible MaaS endpoints
category: agent
credentials:
- name: ANTHROPIC_AUTH_TOKEN
  description: Bearer auth token for the MaaS endpoint
  env_vars:
  - ANTHROPIC_AUTH_TOKEN
  required: true
  auth_style: bearer
  header_name: authorization
  query_param: ''
- name: ANTHROPIC_BASE_URL
  description: Base URL for the MaaS Anthropic-compatible endpoint
  env_vars:
  - ANTHROPIC_BASE_URL
  required: false
  auth_style: header
  header_name: anthropic-base-url
  query_param: ''
binaries:
- /usr/bin/claude
- /usr/local/bin/claude
inference_capable: true
discovery:
  credentials:
  - ANTHROPIC_AUTH_TOKEN`
			writeCmd := fmt.Sprintf("cat > /tmp/claude-code-maas.yaml << 'PROFILEEOF'\n%s\nPROFILEEOF", profileYAML)
			_, _ = s.execOnGateway(r.Context(), req.Namespace, req.Gateway, writeCmd)
			if _, pErr := s.execOnGateway(r.Context(), req.Namespace, req.Gateway, "openshell provider profile import --global --file /tmp/claude-code-maas.yaml 2>&1"); pErr != nil {
				_, _ = s.execOnGateway(r.Context(), req.Namespace, req.Gateway, "openshell provider profile update --global --file /tmp/claude-code-maas.yaml claude-code-maas 2>&1")
			}
		}

		writeJSON(w, map[string]string{"status": "created", "name": req.Name})

	case http.MethodDelete:
		name := r.URL.Query().Get("name")
		if ns == "" || name == "" {
			writeError(w, 400, "namespace and name required")
			return
		}
		if err := sanitizeName(name); err != nil {
			writeError(w, 400, fmt.Sprintf("invalid name: %v", err))
			return
		}
		if err := s.authorizeNamespace(r, ns); err != nil {
			writeError(w, 403, err.Error())
			return
		}
		cmd := fmt.Sprintf("provider delete %s", name)
		_, err := s.execOnWorkspace(r.Context(), ns, gw, cmd)
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

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	type agentInfo struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
		AgentType string `json:"agentType"`
		Workspace string `json:"workspace"`
		Status    string `json:"status"`
		Provider  string `json:"provider"`
		Model     string `json:"model"`
		Age       string `json:"age"`
	}

	// Workspace architecture: list all sandboxes across all workspaces from singleton gateway
	merged := map[string]*agentInfo{}

	// Get all workspaces from the gateway
	wsOut, wsErr := execInGateway(ctx, s.client, s.baseConfig, ns, "openshell workspace list --output json")
	var workspaces []struct {
		Name string `json:"name"`
	}
	if wsErr == nil {
		json.Unmarshal([]byte(wsOut), &workspaces)
	}

	// Per-workspace: get inference config and sandbox list
	for _, ws := range workspaces {
		gwProvider := ""
		gwModel := ""
		if out, err := s.execOnWorkspace(ctx, ns, ws.Name, "inference get"); err == nil {
			for _, line := range strings.Split(out, "\n") {
				cleaned := strings.ReplaceAll(line, "\x1b[2m", "")
				cleaned = strings.ReplaceAll(cleaned, "\x1b[0m", "")
				cleaned = strings.TrimSpace(cleaned)
				if strings.HasPrefix(cleaned, "Provider:") {
					gwProvider = strings.TrimSpace(strings.TrimPrefix(cleaned, "Provider:"))
				}
				if strings.HasPrefix(cleaned, "Model:") {
					gwModel = strings.TrimSpace(strings.TrimPrefix(cleaned, "Model:"))
				}
			}
		}

		sbOut, err := s.execOnWorkspace(ctx, ns, ws.Name, "sandbox list --output json")
		if err != nil {
			continue
		}
		var sandboxes []struct {
			Name      string            `json:"name"`
			Phase     string            `json:"phase"`
			CreatedAt string            `json:"created_at"`
			Labels    map[string]string `json:"labels"`
		}
		if json.Unmarshal([]byte(sbOut), &sandboxes) != nil {
			continue
		}
		for _, sb := range sandboxes {
			at := sb.Labels["agent-type"]
			if at == "" {
				at = ws.Name
			}
			m := sb.Labels["model"]
			if m == "" {
				m = gwModel
			}
			age := sb.CreatedAt
			if t, err := time.Parse("2006-01-02 15:04:05", sb.CreatedAt); err == nil {
				age = time.Since(t).Truncate(time.Second).String()
			}
			status := "Running"
			if sb.Phase == "Provisioning" {
				status = "Pending"
			} else if sb.Phase != "Ready" {
				status = sb.Phase
			}
			merged[sb.Name] = &agentInfo{
				Name: sb.Name, Namespace: ns, AgentType: at, Workspace: ws.Name, Status: status,
				Provider: gwProvider, Model: m, Age: age,
			}
		}
	}

	result := make([]agentInfo, 0, len(merged))
	for _, a := range merged {
		result = append(result, *a)
	}

	writeJSON(w, result)
}

func (s *server) handleInference(w http.ResponseWriter, r *http.Request) {
	ns := r.URL.Query().Get("ns")
	gw := r.URL.Query().Get("gateway")
	if ns == "" {
		writeError(w, 400, "namespace required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	provider := ""
	model := ""
	if out, err := s.execOnWorkspace(ctx, ns, gw, "inference get"); err == nil {
		for _, line := range strings.Split(out, "\n") {
			cleaned := strings.ReplaceAll(line, "\x1b[2m", "")
			cleaned = strings.ReplaceAll(cleaned, "\x1b[0m", "")
			cleaned = strings.TrimSpace(cleaned)
			if strings.HasPrefix(cleaned, "Provider:") {
				provider = strings.TrimSpace(strings.TrimPrefix(cleaned, "Provider:"))
			}
			if strings.HasPrefix(cleaned, "Model:") {
				model = strings.TrimSpace(strings.TrimPrefix(cleaned, "Model:"))
			}
		}
	}

	writeJSON(w, map[string]string{"provider": provider, "model": model})
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

	userClient, _, _ := s.userClients(r)

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	// Try direct name lookup first (old naming: sandbox-xxxxx)
	pod, err := userClient.CoreV1().Pods(ns).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		// New naming convention (0.0.95+): {workspace}--{sandbox_name}
		// Look up the Sandbox CR to find the workspace, then construct pod name
		sandboxCR, crErr := userClient.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{Limit: 1})
		_ = sandboxCR
		_ = crErr
		// Try common workspace prefixes: "default--{name}"
		pod2, err2 := userClient.CoreV1().Pods(ns).Get(ctx, fmt.Sprintf("default--%s", name), metav1.GetOptions{})
		if err2 == nil {
			pod = pod2
		} else {
			// Last resort: list all pods and find one whose name ends with the sandbox name
			allPods, listErr := userClient.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
			if listErr != nil {
				writeError(w, 404, fmt.Sprintf("no pod found for sandbox %s", name))
				return
			}
			found := false
			for i := range allPods.Items {
				if strings.HasSuffix(allPods.Items[i].Name, "--"+name) || allPods.Items[i].Name == name {
					pod = &allPods.Items[i]
					found = true
					break
				}
			}
			if !found {
				writeError(w, 404, fmt.Sprintf("no pod found for sandbox %s", name))
				return
			}
		}
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
	if err := sanitizeName(name); err != nil {
		writeError(w, 400, fmt.Sprintf("invalid name: %v", err))
		return
	}
	if err := s.authorizeNamespace(r, ns); err != nil {
		writeError(w, 403, err.Error())
		return
	}

	workspace := r.URL.Query().Get("workspace")
	cmd := fmt.Sprintf("sandbox delete %s", name)
	_, err := s.execOnWorkspace(r.Context(), ns, workspace, cmd)
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
		Namespace  string `json:"namespace"`
		Gateway    string `json:"gateway"`
		AgentType  string `json:"agentType"`
		AgentLabel string `json:"agentLabel"`
		Provider   string `json:"provider"`
		WarmPool   string `json:"warmPool"`
		Count      int    `json:"count"`
		Model      string `json:"model"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, 400, "invalid request body")
		return
	}

	for _, check := range []struct{ name, val string }{
		{"gateway", req.Gateway}, {"provider", req.Provider}, {"agentLabel", req.AgentLabel},
	} {
		if check.val != "" {
			if err := sanitizeName(check.val); err != nil {
				writeError(w, 400, fmt.Sprintf("invalid %s: %v", check.name, err))
				return
			}
		}
	}
	if err := sanitizeImageRef(req.AgentType); err != nil {
		writeError(w, 400, fmt.Sprintf("invalid agentType: %v", err))
		return
	}
	if req.WarmPool != "" {
		if err := sanitizeName(req.WarmPool); err != nil {
			writeError(w, 400, fmt.Sprintf("invalid warmPool: %v", err))
			return
		}
	}
	if err := s.authorizeNamespace(r, req.Namespace); err != nil {
		writeError(w, 403, err.Error())
		return
	}

	if req.Count < 1 {
		req.Count = 1
	}
	if req.Count > 10 {
		req.Count = 10
	}

	ctx := r.Context()

	// Enable providers v2 and policy proposals (global, not workspace-scoped)
	_, err := execInGateway(ctx, s.client, s.baseConfig, req.Namespace,
		"openshell settings set --global --key providers_v2_enabled --value true --yes")
	if err != nil {
		log.Printf("warning: failed to enable providers_v2: %v", err)
	}
	_, err = execInGateway(ctx, s.client, s.baseConfig, req.Namespace,
		"openshell settings set --global --key agent_policy_proposals_enabled --value true --yes")
	if err != nil {
		log.Printf("warning: failed to enable agent_policy_proposals: %v", err)
	}

	// Only set inference if not already configured for this workspace
	inferOut, _ := s.execOnWorkspace(ctx, req.Namespace, req.Gateway, "inference get")
	if strings.Contains(inferOut, "Not configured") && req.Provider != "" {
		inferCmd := fmt.Sprintf("inference set --provider %s --no-verify", req.Provider)
		if req.Model != "" {
			inferCmd += fmt.Sprintf(" --model %s", req.Model)
		} else {
			inferCmd += " --model claude-sonnet-4-6"
		}
		_, err = s.execOnWorkspace(ctx, req.Namespace, req.Gateway, inferCmd)
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

		createCmd := fmt.Sprintf("sandbox create --name %s", name)
		if req.AgentType != "" {
			createCmd += fmt.Sprintf(" --from %s", req.AgentType)
		}
		if req.AgentLabel != "" {
			createCmd += fmt.Sprintf(" --label agent-type=%s", req.AgentLabel)
		}
		if req.Model != "" {
			sanitized := strings.Map(func(r rune) rune {
				if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' || r == '.' {
					return r
				}
				return '-'
			}, req.Model)
			createCmd += fmt.Sprintf(" --label model=%s", sanitized)
		}
		if req.WarmPool != "" {
			createCmd += fmt.Sprintf(" --warm-pool %s", req.WarmPool)
		}
		if req.Provider != "" {
			createCmd += fmt.Sprintf(" --provider %s", req.Provider)
		}

		_, err := s.execOnWorkspace(ctx, req.Namespace, req.Gateway, createCmd)
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

	userClient, _, _ := s.userClients(r)

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
