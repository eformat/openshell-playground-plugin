package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/kubernetes"
)

const (
	gatewayImage  = "quay.io/eformat/openshell-gateway:0.0.95-dev"
	deployerImage = "quay.io/eformat/openshell-deployer:0.0.95-dev"
	gatewayName   = "openshell"
)

func gatewayTOML(ns string) string {
	return fmt.Sprintf(`[openshell]
version = 1

[openshell.gateway]
bind_address = "0.0.0.0:8080"
health_bind_address = "0.0.0.0:8081"
log_level = "info"
compute_drivers = ["kubernetes"]
disable_tls = true

[openshell.gateway.auth]
allow_unauthenticated_users = true

[openshell.gateway.gateway_jwt]
signing_key_path = "/var/run/jwt/signing.pem"
public_key_path = "/var/run/jwt/public.pem"
kid_path = "/var/run/jwt/kid"

[openshell.drivers.kubernetes]
namespace = "%s"
service_account_name = "openshell-sandbox"
default_image = "ghcr.io/nvidia/openshell-community/sandboxes/base:latest"
supervisor_image = "quay.io/eformat/openshell-supervisor:0.0.95-dev"
grpc_endpoint = "http://%s.%s.svc.cluster.local:8080"
workspace_default_storage_size = "2Gi"
`, ns, gatewayName, ns)
}

// ensureGateway deploys the singleton gateway if it doesn't already exist.
func ensureGateway(ctx context.Context, client kubernetes.Interface, saClient kubernetes.Interface, namespace string) error {
	labels := map[string]string{"app": "openshell"}
	jwtSecretName := fmt.Sprintf("%s-jwt-keys", gatewayName)
	configMapName := fmt.Sprintf("%s-config", gatewayName)

	// ServiceAccounts
	for _, saName := range []string{"openshell-gateway", "openshell-sandbox"} {
		if _, err := client.CoreV1().ServiceAccounts(namespace).Create(ctx, &corev1.ServiceAccount{
			ObjectMeta: metav1.ObjectMeta{Name: saName, Labels: labels},
		}, metav1.CreateOptions{}); err != nil && !errors.IsAlreadyExists(err) {
			return fmt.Errorf("failed to create SA %s: %w", saName, err)
		}
	}

	// Namespace Role
	role := &rbacv1.Role{
		ObjectMeta: metav1.ObjectMeta{Name: "openshell-gateway", Labels: labels},
		Rules: []rbacv1.PolicyRule{
			{APIGroups: []string{""}, Resources: []string{"pods", "services", "configmaps", "secrets"}, Verbs: []string{"get", "list", "watch", "create", "update", "delete"}},
			{APIGroups: []string{""}, Resources: []string{"pods/exec"}, Verbs: []string{"create"}},
			{APIGroups: []string{""}, Resources: []string{"events"}, Verbs: []string{"get", "list", "watch", "create"}},
			{APIGroups: []string{"apps"}, Resources: []string{"statefulsets"}, Verbs: []string{"get", "list", "watch"}},
			{APIGroups: []string{"extensions.agents.x-k8s.io"}, Resources: []string{"sandboxtemplates", "sandboxwarmpools", "sandboxclaims"}, Verbs: []string{"get", "list", "watch", "create", "update", "delete"}},
			{APIGroups: []string{"agents.x-k8s.io"}, Resources: []string{"sandboxes"}, Verbs: []string{"get", "list", "watch", "create", "update", "delete"}},
		},
	}
	if _, err := client.RbacV1().Roles(namespace).Create(ctx, role, metav1.CreateOptions{}); err != nil && !errors.IsAlreadyExists(err) {
		return fmt.Errorf("failed to create gateway Role: %w", err)
	}
	if _, err := client.RbacV1().RoleBindings(namespace).Create(ctx, &rbacv1.RoleBinding{
		ObjectMeta: metav1.ObjectMeta{Name: "openshell-gateway", Labels: labels},
		RoleRef:    rbacv1.RoleRef{APIGroup: "rbac.authorization.k8s.io", Kind: "Role", Name: "openshell-gateway"},
		Subjects:   []rbacv1.Subject{{Kind: "ServiceAccount", Name: "openshell-gateway", Namespace: namespace}},
	}, metav1.CreateOptions{}); err != nil && !errors.IsAlreadyExists(err) {
		return fmt.Errorf("failed to create gateway RoleBinding: %w", err)
	}

	// Plugin SA RoleBindings (cluster-scoped permissions via plugin SA)
	if _, err := saClient.RbacV1().RoleBindings(namespace).Create(ctx, &rbacv1.RoleBinding{
		ObjectMeta: metav1.ObjectMeta{Name: "openshell-gateway", Namespace: namespace, Labels: labels},
		RoleRef:    rbacv1.RoleRef{APIGroup: "rbac.authorization.k8s.io", Kind: "ClusterRole", Name: "openshell-playground-plugin-gateway"},
		Subjects:   []rbacv1.Subject{{Kind: "ServiceAccount", Name: "openshell-gateway", Namespace: namespace}},
	}, metav1.CreateOptions{}); err != nil && !errors.IsAlreadyExists(err) {
		log.Printf("warning: failed to create gateway ClusterRole RoleBinding: %v", err)
	}

	authCRBName := fmt.Sprintf("openshell-gateway-auth-%s", namespace)
	if _, err := saClient.RbacV1().ClusterRoleBindings().Create(ctx, &rbacv1.ClusterRoleBinding{
		ObjectMeta: metav1.ObjectMeta{Name: authCRBName, Labels: map[string]string{"app": "openshell", "openshell.ai/namespace": namespace}},
		RoleRef:    rbacv1.RoleRef{APIGroup: "rbac.authorization.k8s.io", Kind: "ClusterRole", Name: "openshell-playground-plugin-gateway-auth"},
		Subjects:   []rbacv1.Subject{{Kind: "ServiceAccount", Name: "openshell-gateway", Namespace: namespace}},
	}, metav1.CreateOptions{}); err != nil && !errors.IsAlreadyExists(err) {
		log.Printf("warning: failed to create gateway auth ClusterRoleBinding: %v", err)
	}

	if _, err := saClient.RbacV1().RoleBindings(namespace).Create(ctx, &rbacv1.RoleBinding{
		ObjectMeta: metav1.ObjectMeta{Name: "openshell-sandbox-scc", Namespace: namespace, Labels: labels},
		RoleRef:    rbacv1.RoleRef{APIGroup: "rbac.authorization.k8s.io", Kind: "ClusterRole", Name: "system:openshift:scc:openshell-sandbox"},
		Subjects:   []rbacv1.Subject{{Kind: "ServiceAccount", Name: "openshell-sandbox", Namespace: namespace}},
	}, metav1.CreateOptions{}); err != nil && !errors.IsAlreadyExists(err) {
		log.Printf("warning: failed to create sandbox SCC RoleBinding: %v", err)
	}

	// NetworkPolicy
	protocol := corev1.ProtocolTCP
	port8080 := intstr.FromInt(8080)
	port7681 := intstr.FromInt(7681)
	if _, err := client.NetworkingV1().NetworkPolicies(namespace).Create(ctx, &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{Name: "openshell-deny-sandbox-to-gateway", Labels: labels},
		Spec: networkingv1.NetworkPolicySpec{
			PodSelector: metav1.LabelSelector{MatchLabels: labels},
			Ingress: []networkingv1.NetworkPolicyIngressRule{
				{Ports: []networkingv1.NetworkPolicyPort{{Protocol: &protocol, Port: &port8080}}, From: []networkingv1.NetworkPolicyPeer{{PodSelector: &metav1.LabelSelector{}}}},
				{Ports: []networkingv1.NetworkPolicyPort{{Protocol: &protocol, Port: &port7681}}},
			},
			PolicyTypes: []networkingv1.PolicyType{networkingv1.PolicyTypeIngress},
		},
	}, metav1.CreateOptions{}); err != nil && !errors.IsAlreadyExists(err) {
		log.Printf("warning: failed to create NetworkPolicy: %v", err)
	}

	// Skip if StatefulSet already exists (idempotent)
	if _, err := client.AppsV1().StatefulSets(namespace).Get(ctx, gatewayName, metav1.GetOptions{}); err == nil {
		log.Printf("gateway already exists in namespace %s", namespace)
		return nil
	}

	// Certgen Job
	backoffLimit := int32(3)
	ttl := int32(120)
	certgenJobName := fmt.Sprintf("%s-certgen", gatewayName)
	certgenJob := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{Name: certgenJobName, Labels: labels},
		Spec: batchv1.JobSpec{
			BackoffLimit:            &backoffLimit,
			TTLSecondsAfterFinished: &ttl,
			Template: corev1.PodTemplateSpec{
				Spec: corev1.PodSpec{
					ServiceAccountName: "openshell-gateway",
					RestartPolicy:      corev1.RestartPolicyNever,
					Containers: []corev1.Container{{
						Name:    "certgen",
						Image:   gatewayImage,
						Command: []string{"openshell-gateway", "generate-certs", "--jwt-only", "--jwt-secret-name", jwtSecretName, "--namespace", namespace},
						Env:     []corev1.EnvVar{{Name: "POD_NAMESPACE", Value: namespace}},
					}},
				},
			},
		},
	}
	if _, err := client.BatchV1().Jobs(namespace).Create(ctx, certgenJob, metav1.CreateOptions{}); err != nil && !errors.IsAlreadyExists(err) {
		return fmt.Errorf("failed to create certgen Job: %w", err)
	}
	for range 30 {
		time.Sleep(2 * time.Second)
		job, err := client.BatchV1().Jobs(namespace).Get(ctx, certgenJobName, metav1.GetOptions{})
		if err != nil {
			continue
		}
		if job.Status.Succeeded > 0 {
			break
		}
	}

	// ConfigMap
	if _, err := client.CoreV1().ConfigMaps(namespace).Create(ctx, &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: configMapName, Labels: labels},
		Data:       map[string]string{"gateway.toml": gatewayTOML(namespace)},
	}, metav1.CreateOptions{}); err != nil && !errors.IsAlreadyExists(err) {
		return fmt.Errorf("failed to create gateway config: %w", err)
	}

	// StatefulSet
	replicas := int32(1)
	sts := &appsv1.StatefulSet{
		ObjectMeta: metav1.ObjectMeta{Name: gatewayName, Labels: labels},
		Spec: appsv1.StatefulSetSpec{
			ServiceName: gatewayName,
			Replicas:    &replicas,
			Selector:    &metav1.LabelSelector{MatchLabels: labels},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: labels},
				Spec: corev1.PodSpec{
					ServiceAccountName: "openshell-gateway",
					Containers: []corev1.Container{
						{
							Name:            "openshell",
							Image:           gatewayImage,
							ImagePullPolicy: corev1.PullAlways,
							Ports: []corev1.ContainerPort{
								{ContainerPort: 8080, Name: "grpc"},
								{ContainerPort: 8081, Name: "health"},
							},
							Env: []corev1.EnvVar{
								{Name: "HOME", Value: "/tmp"},
								{Name: "OPENSHELL_GATEWAY_CONFIG", Value: "/etc/openshell/gateway.toml"},
								{Name: "OPENSHELL_DB_URL", Value: "sqlite:///var/lib/openshell/gateway.db?mode=rwc"},
							},
							VolumeMounts: []corev1.VolumeMount{
								{Name: "state", MountPath: "/tmp/.local"},
								{Name: "gateway-config", MountPath: "/etc/openshell", ReadOnly: true},
								{Name: "jwt-keys", MountPath: "/var/run/jwt", ReadOnly: true},
								{Name: "data", MountPath: "/var/lib/openshell"},
							},
							Resources: corev1.ResourceRequirements{
								Requests: corev1.ResourceList{corev1.ResourceCPU: resource.MustParse("100m"), corev1.ResourceMemory: resource.MustParse("256Mi")},
								Limits:   corev1.ResourceList{corev1.ResourceCPU: resource.MustParse("1"), corev1.ResourceMemory: resource.MustParse("1Gi")},
							},
							LivenessProbe:  &corev1.Probe{ProbeHandler: corev1.ProbeHandler{HTTPGet: &corev1.HTTPGetAction{Path: "/healthz", Port: intstr.FromInt(8081)}}, InitialDelaySeconds: 15, PeriodSeconds: 30},
							ReadinessProbe: &corev1.Probe{ProbeHandler: corev1.ProbeHandler{HTTPGet: &corev1.HTTPGetAction{Path: "/readyz", Port: intstr.FromInt(8081)}}, InitialDelaySeconds: 5, PeriodSeconds: 10},
						},
						{
							Name:            "openshell-cli",
							Image:           deployerImage,
							ImagePullPolicy: corev1.PullAlways,
							Command: []string{"bash", "-c", `sleep 5
openshell gateway add --name gateway --local http://localhost:8080 2>/dev/null || true
openshell gateway select gateway 2>/dev/null || true
exec ttyd -W -p 7681 -t disableLeaveAlert=true -t disableResizeOverlay=true bash -c 'export HOME=/tmp TERM=xterm-256color OPENSHELL_THEME=dark TOKIO_WORKER_THREADS=4; openshell gateway add --name gateway --local http://localhost:8080 2>/dev/null; openshell gateway select gateway 2>/dev/null; exec openshell term --theme dark'`},
							Env: []corev1.EnvVar{
								{Name: "TERM", Value: "xterm-256color"},
								{Name: "HOME", Value: "/tmp"},
								{Name: "OPENSHELL_THEME", Value: "dark"},
								{Name: "TOKIO_WORKER_THREADS", Value: "4"},
							},
							Ports:     []corev1.ContainerPort{{ContainerPort: 7681, Name: "ttyd"}},
							Resources: corev1.ResourceRequirements{Requests: corev1.ResourceList{corev1.ResourceCPU: resource.MustParse("100m"), corev1.ResourceMemory: resource.MustParse("64Mi")}, Limits: corev1.ResourceList{corev1.ResourceCPU: resource.MustParse("2"), corev1.ResourceMemory: resource.MustParse("512Mi")}},
						},
					},
					Volumes: []corev1.Volume{
						{Name: "state", VolumeSource: corev1.VolumeSource{EmptyDir: &corev1.EmptyDirVolumeSource{}}},
						{Name: "gateway-config", VolumeSource: corev1.VolumeSource{ConfigMap: &corev1.ConfigMapVolumeSource{LocalObjectReference: corev1.LocalObjectReference{Name: configMapName}}}},
						{Name: "jwt-keys", VolumeSource: corev1.VolumeSource{Secret: &corev1.SecretVolumeSource{SecretName: jwtSecretName, Optional: boolPtr(true)}}},
					},
				},
			},
			VolumeClaimTemplates: []corev1.PersistentVolumeClaim{{
				ObjectMeta: metav1.ObjectMeta{Name: "data"},
				Spec:       corev1.PersistentVolumeClaimSpec{AccessModes: []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce}, Resources: corev1.VolumeResourceRequirements{Requests: corev1.ResourceList{corev1.ResourceStorage: resource.MustParse("1Gi")}}},
			}},
		},
	}
	if _, err := client.AppsV1().StatefulSets(namespace).Create(ctx, sts, metav1.CreateOptions{}); err != nil && !errors.IsAlreadyExists(err) {
		return fmt.Errorf("failed to create gateway StatefulSet: %w", err)
	}

	// Service
	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: gatewayName, Labels: labels},
		Spec: corev1.ServiceSpec{
			Type:     corev1.ServiceTypeClusterIP,
			Selector: labels,
			Ports: []corev1.ServicePort{
				{Name: "grpc", Port: 8080, TargetPort: intstr.FromInt(8080)},
				{Name: "ttyd", Port: 7681, TargetPort: intstr.FromInt(7681)},
			},
		},
	}
	if _, err := client.CoreV1().Services(namespace).Create(ctx, svc, metav1.CreateOptions{}); err != nil && !errors.IsAlreadyExists(err) {
		return fmt.Errorf("failed to create gateway Service: %w", err)
	}

	// Wait for gateway pod ready
	log.Printf("waiting for gateway pod in namespace %s", namespace)
	for range 60 {
		time.Sleep(2 * time.Second)
		pods, err := client.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{LabelSelector: "app=openshell"})
		if err != nil || len(pods.Items) == 0 {
			continue
		}
		if pods.Items[0].Status.Phase == corev1.PodRunning && len(pods.Items[0].Status.ContainerStatuses) >= 2 {
			allReady := true
			for _, c := range pods.Items[0].Status.ContainerStatuses {
				if !c.Ready {
					allReady = false
				}
			}
			if allReady {
				log.Printf("gateway deployed to namespace %s", namespace)
				return nil
			}
		}
	}
	log.Printf("gateway deployed to namespace %s (pod not yet ready)", namespace)
	return nil
}

// ensureWorkspace creates a workspace on the gateway if it doesn't exist.
// It restarts the gateway pod after creation so the TUI session picks up the new workspace.
func (s *server) ensureWorkspace(ctx context.Context, namespace, workspace string) error {
	// Check if workspace already exists
	listOut, _ := execInNamedGateway(ctx, s.client, s.baseConfig, namespace, gatewayName, "openshell workspace list --output json")
	var existing []struct{ Name string `json:"name"` }
	json.Unmarshal([]byte(listOut), &existing)
	for _, ws := range existing {
		if ws.Name == workspace {
			log.Printf("workspace %s already exists in namespace %s", workspace, namespace)
			return nil
		}
	}

	cmd := fmt.Sprintf("openshell workspace create --name %s 2>&1 || true", workspace)
	out, err := execInNamedGateway(ctx, s.client, s.baseConfig, namespace, gatewayName, cmd)
	if err != nil {
		return fmt.Errorf("failed to create workspace %s: %w", workspace, err)
	}
	log.Printf("workspace %s in namespace %s: %s", workspace, namespace, strings.TrimSpace(out))

	return nil
}

func boolPtr(b bool) *bool { return &b }

func (s *server) handleGatewayDeploy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, 405, "method not allowed")
		return
	}

	var req struct {
		Namespace string `json:"namespace"`
		AgentType string `json:"agentType"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Namespace == "" || req.AgentType == "" {
		writeError(w, 400, "namespace and agentType required")
		return
	}
	if err := sanitizeName(req.AgentType); err != nil {
		writeError(w, 400, fmt.Sprintf("invalid agentType: %v", err))
		return
	}
	if err := sanitizeName(req.Namespace); err != nil {
		writeError(w, 400, fmt.Sprintf("invalid namespace: %v", err))
		return
	}
	if err := s.authorizeNamespace(r, req.Namespace); err != nil {
		writeError(w, 403, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 180*time.Second)
	defer cancel()

	userClient, _, _ := s.userClients(r)

	// Ensure singleton gateway exists
	if err := ensureGateway(ctx, userClient, s.client, req.Namespace); err != nil {
		writeError(w, 500, fmt.Sprintf("failed to deploy gateway: %v", err))
		return
	}

	// Create the workspace for this agent type
	if err := s.ensureWorkspace(ctx, req.Namespace, req.AgentType); err != nil {
		writeError(w, 500, fmt.Sprintf("failed to create workspace: %v", err))
		return
	}

	writeJSON(w, map[string]string{"status": "deployed", "namespace": req.Namespace, "agentType": req.AgentType})
}

func (s *server) handleGatewayDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeError(w, 405, "method not allowed")
		return
	}
	ns := r.URL.Query().Get("ns")
	name := r.URL.Query().Get("name")
	if ns == "" || name == "" {
		writeError(w, 400, "namespace and name required")
		return
	}
	if err := sanitizeName(ns); err != nil {
		writeError(w, 400, fmt.Sprintf("invalid namespace: %v", err))
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

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	// "default" workspace cannot be deleted — treat as full gateway teardown
	teardown := name == "default"
	if !teardown {
		// workspace delete fails if it still has providers or sandboxes — clean them up first.
		provOut, _ := execInNamedGateway(ctx, s.client, s.baseConfig, ns, gatewayName,
			fmt.Sprintf("openshell --workspace %s provider list --output json 2>/dev/null", name))
		var providers []struct{ Name string `json:"name"` }
		if json.Unmarshal([]byte(provOut), &providers) == nil {
			for _, p := range providers {
				delCmd := fmt.Sprintf("openshell --workspace %s provider delete %s 2>&1", name, p.Name)
				if out, err := execInNamedGateway(ctx, s.client, s.baseConfig, ns, gatewayName, delCmd); err != nil {
					log.Printf("warning: provider delete %s in workspace %s: %v — %s", p.Name, name, err, strings.TrimSpace(out))
				}
			}
		}

		sbOut, _ := execInNamedGateway(ctx, s.client, s.baseConfig, ns, gatewayName,
			fmt.Sprintf("openshell --workspace %s sandbox list --output json 2>/dev/null", name))
		var sandboxes []struct{ Name string `json:"name"` }
		if json.Unmarshal([]byte(sbOut), &sandboxes) == nil {
			for _, sb := range sandboxes {
				delCmd := fmt.Sprintf("openshell --workspace %s sandbox delete %s 2>&1", name, sb.Name)
				if out, err := execInNamedGateway(ctx, s.client, s.baseConfig, ns, gatewayName, delCmd); err != nil {
					log.Printf("warning: sandbox delete %s in workspace %s: %v — %s", sb.Name, name, err, strings.TrimSpace(out))
				}
			}
		}

		cmd := fmt.Sprintf("openshell workspace delete %s 2>&1", name)
		out, delErr := execInNamedGateway(ctx, s.client, s.baseConfig, ns, gatewayName, cmd)
		if delErr != nil {
			writeError(w, 500, fmt.Sprintf("failed to delete workspace %s: %v — %s", name, delErr, strings.TrimSpace(out)))
			return
		}
		// Tear down if no non-default workspaces remain. "default" always persists
		// in OpenShell so len(workspaces)==0 is never true; count only named workspaces.
		listOut, listErr := execInNamedGateway(ctx, s.client, s.baseConfig, ns, gatewayName, "openshell workspace list --output json")
		if listErr == nil {
			var workspaces []struct{ Name string `json:"name"` }
			if json.Unmarshal([]byte(listOut), &workspaces) == nil {
				nonDefault := 0
				for _, ws := range workspaces {
					if ws.Name != "default" {
						nonDefault++
					}
				}
				if nonDefault == 0 {
					teardown = true
				}
			}
		}
	}

	if teardown {
		userClient, _, _ := s.userClients(r)
		_ = userClient.AppsV1().StatefulSets(ns).Delete(ctx, gatewayName, metav1.DeleteOptions{})
		_ = userClient.CoreV1().Services(ns).Delete(ctx, gatewayName, metav1.DeleteOptions{})
		_ = userClient.CoreV1().ConfigMaps(ns).Delete(ctx, gatewayName+"-config", metav1.DeleteOptions{})
		_ = userClient.CoreV1().Secrets(ns).Delete(ctx, gatewayName+"-jwt-keys", metav1.DeleteOptions{})
		_ = userClient.CoreV1().PersistentVolumeClaims(ns).Delete(ctx, "data-"+gatewayName+"-0", metav1.DeleteOptions{})
		_ = userClient.NetworkingV1().NetworkPolicies(ns).Delete(ctx, "openshell-deny-sandbox-to-gateway", metav1.DeleteOptions{})
		propagation := metav1.DeletePropagationBackground
		jobList, _ := userClient.BatchV1().Jobs(ns).List(ctx, metav1.ListOptions{})
		if jobList != nil {
			for _, j := range jobList.Items {
				if strings.HasPrefix(j.Name, gatewayName+"-certgen") {
					_ = userClient.BatchV1().Jobs(ns).Delete(ctx, j.Name, metav1.DeleteOptions{PropagationPolicy: &propagation})
				}
			}
		}
		_ = s.client.RbacV1().ClusterRoleBindings().Delete(ctx, fmt.Sprintf("openshell-gateway-auth-%s", ns), metav1.DeleteOptions{})
		log.Printf("gateway torn down in namespace %s (no remaining workspaces)", ns)
	}

	log.Printf("workspace %s deleted from namespace %s", name, ns)
	writeJSON(w, map[string]string{"status": "deleted", "name": name})
}

func (s *server) handleListGateways(w http.ResponseWriter, r *http.Request) {
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

	type gatewayInfo struct {
		Name      string `json:"name"`
		AgentType string `json:"agentType"`
		Status    string `json:"status"`
	}

	// Check if the singleton gateway pod is running
	pods, err := userClient.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{LabelSelector: "app=openshell"})
	if err != nil || len(pods.Items) == 0 {
		writeJSON(w, []gatewayInfo{})
		return
	}

	// Determine gateway pod readiness
	podReady := false
	for _, pod := range pods.Items {
		if pod.Status.Phase == corev1.PodRunning && len(pod.Status.ContainerStatuses) >= 2 {
			allReady := true
			for _, c := range pod.Status.ContainerStatuses {
				if !c.Ready {
					allReady = false
				}
			}
			if allReady {
				podReady = true
				break
			}
		}
	}

	if !podReady {
		writeJSON(w, []gatewayInfo{})
		return
	}

	// List workspaces from the gateway
	listOut, err := execInNamedGateway(ctx, s.client, s.baseConfig, ns, gatewayName, "openshell workspace list --output json")
	if err != nil {
		writeJSON(w, []gatewayInfo{})
		return
	}

	var rawWorkspaces []struct {
		Name string `json:"name"`
	}
	result := []gatewayInfo{}
	if json.Unmarshal([]byte(listOut), &rawWorkspaces) == nil {
		for _, ws := range rawWorkspaces {
			if ws.Name == "" {
				continue
			}
			result = append(result, gatewayInfo{Name: ws.Name, AgentType: ws.Name, Status: "Running"})
		}
	}

	writeJSON(w, result)
}
