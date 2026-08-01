package main

import (
	"bytes"
	"context"
	"fmt"
	"strings"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/remotecommand"
)

// execInNamedGateway targets a specific gateway pod by StatefulSet name.
// In workspace architecture, the gateway is always the singleton "openshell-0".
func execInNamedGateway(ctx context.Context, client kubernetes.Interface, config *rest.Config, namespace, stsName, command string) (string, error) {
	podName := fmt.Sprintf("%s-0", stsName)
	return execInPod(ctx, client, config, namespace, podName, "openshell-cli", command)
}

// execInGateway targets the singleton openshell gateway pod.
func execInGateway(ctx context.Context, client kubernetes.Interface, config *rest.Config, namespace, command string) (string, error) {
	return execInPod(ctx, client, config, namespace, "openshell-0", "openshell-cli", command)
}

func execInPod(ctx context.Context, client kubernetes.Interface, config *rest.Config, namespace, podName, containerName, command string) (string, error) {
	if config == nil {
		var cfgErr error
		config, cfgErr = buildConfig()
		if cfgErr != nil {
			return "", fmt.Errorf("failed to get k8s config: %w", cfgErr)
		}
	}

	wrappedCmd := fmt.Sprintf("export HOME=/tmp; %s", command)

	req := client.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(podName).
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
