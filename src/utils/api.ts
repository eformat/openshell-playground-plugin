import {
  AgentInfo,
  AgentTypeInfo,
  CreateProviderRequest,
  DeployRequest,
  DeployResponse,
  NamespaceInfo,
  PodInfo,
  ProviderInfo,
  WarmPoolInfo,
} from './types';

const BASE_PATH = '/api/proxy/plugin/openshell-playground-plugin/backend/api';

function getCsrfToken(): string {
  const match = document.cookie.match(/csrf-token=([^;]+)/);
  return match ? match[1] : '';
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  const csrfToken = getCsrfToken();
  if (csrfToken) {
    headers['X-CSRFToken'] = csrfToken;
  }

  const response = await fetch(`${BASE_PATH}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error || `Request failed: ${response.status}`);
  }

  return response.json();
}

export async function listNamespaces(): Promise<NamespaceInfo[]> {
  return request<NamespaceInfo[]>('/namespaces');
}

export async function listAgentTypes(): Promise<AgentTypeInfo[]> {
  return request<AgentTypeInfo[]>('/agent-types');
}

export interface GatewayInfo {
  name: string;
  agentType: string;
  status: string;
}

export async function listGateways(namespace: string): Promise<GatewayInfo[]> {
  return request<GatewayInfo[]>(`/gateways?ns=${encodeURIComponent(namespace)}`);
}

export async function listProviders(namespace: string, gateway?: string): Promise<ProviderInfo[]> {
  let url = `/providers?ns=${encodeURIComponent(namespace)}`;
  if (gateway) url += `&gateway=${encodeURIComponent(gateway)}`;
  return request<ProviderInfo[]>(url);
}

export async function createProvider(req: CreateProviderRequest): Promise<{ status: string; name: string }> {
  return request('/providers', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function deleteProvider(name: string, namespace: string, gateway?: string): Promise<void> {
  let url = `/providers?ns=${encodeURIComponent(namespace)}&name=${encodeURIComponent(name)}`;
  if (gateway) url += `&gateway=${encodeURIComponent(gateway)}`;
  await request(url, { method: 'DELETE' });
}

export async function listWarmPools(namespace: string): Promise<WarmPoolInfo[]> {
  return request<WarmPoolInfo[]>(`/warmpools?ns=${encodeURIComponent(namespace)}`);
}

export async function listAgents(namespace: string): Promise<AgentInfo[]> {
  return request<AgentInfo[]>(`/agents?ns=${encodeURIComponent(namespace)}`);
}

export async function deploy(req: DeployRequest): Promise<DeployResponse> {
  return request<DeployResponse>('/deploy', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function deleteAgent(name: string, namespace: string): Promise<void> {
  await request(`/agents/${encodeURIComponent(name)}?ns=${encodeURIComponent(namespace)}`, {
    method: 'DELETE',
  });
}

export async function getAgentPod(name: string, namespace: string): Promise<PodInfo> {
  return request<PodInfo>(`/agents/${encodeURIComponent(name)}/pod?ns=${encodeURIComponent(namespace)}`);
}

export async function getGatewayPod(namespace: string): Promise<PodInfo> {
  return request<PodInfo>(`/gateway/pod?ns=${encodeURIComponent(namespace)}`);
}

export async function deleteGateway(namespace: string, name: string): Promise<void> {
  await request(`/gateway/delete?ns=${encodeURIComponent(namespace)}&name=${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

export async function deployGateway(namespace: string, agentType: string): Promise<{ status: string }> {
  return request('/gateway/deploy', {
    method: 'POST',
    body: JSON.stringify({ namespace, agentType }),
  });
}
