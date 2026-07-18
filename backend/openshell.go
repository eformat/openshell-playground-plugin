package main

import (
	"bytes"
	"context"
	"fmt"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/tools/remotecommand"
)

func execInGateway(ctx context.Context, client kubernetes.Interface, namespace, command string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()

	pods, err := client.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: "app=openshell",
	})
	if err != nil {
		return "", fmt.Errorf("failed to find gateway pods: %w", err)
	}

	var gatewayPod string
	if len(pods.Items) > 0 {
		gatewayPod = pods.Items[0].Name
	} else {
		allPods, err := client.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			return "", fmt.Errorf("failed to list pods: %w", err)
		}
		for _, pod := range allPods.Items {
			if strings.HasPrefix(pod.Name, "openshell-") {
				gatewayPod = pod.Name
				break
			}
		}
	}

	if gatewayPod == "" {
		return "", fmt.Errorf("no openshell gateway pod found in namespace %s", namespace)
	}

	containerName := "openshell-cli"

	config, err := buildConfig()
	if err != nil {
		return "", fmt.Errorf("failed to get k8s config: %w", err)
	}

	wrappedCmd := fmt.Sprintf("export HOME=/tmp; %s", command)

	req := client.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(gatewayPod).
		Namespace(namespace).
		SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Container: containerName,
			Command:   []string{"sh", "-c", wrappedCmd},
			Stdout:    true,
			Stderr:    true,
		}, scheme.ParameterCodec)

	exec, err := remotecommand.NewSPDYExecutor(config, "POST", req.URL())
	if err != nil {
		return "", fmt.Errorf("failed to create executor: %w", err)
	}

	var stdout, stderr bytes.Buffer
	err = exec.StreamWithContext(ctx, remotecommand.StreamOptions{
		Stdout: &stdout,
		Stderr: &stderr,
	})
	if err != nil {
		combined := stdout.String() + stderr.String()
		if strings.Contains(combined, "Created sandbox") {
			return stdout.String(), nil
		}
		return "", fmt.Errorf("exec failed: %w (stderr: %s)", err, stderr.String())
	}

	return stdout.String(), nil
}
