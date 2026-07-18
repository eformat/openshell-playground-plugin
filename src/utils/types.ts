export interface AgentTypeInfo {
  name: string;
  displayName: string;
  description: string;
  image: string;
  sandbox: string;
}

export interface ProviderInfo {
  name: string;
  type: string;
  models: string[];
}

export interface WarmPoolInfo {
  name: string;
  replicas: number;
  available: number;
  template: string;
}

export interface AgentInfo {
  name: string;
  namespace: string;
  agentType: string;
  status: string;
  sandbox: string;
  provider: string;
  age: string;
}

export interface NamespaceInfo {
  name: string;
  status: string;
}

export interface PodInfo {
  podName: string;
  containerName: string;
  status: string;
}

export interface DeployRequest {
  namespace: string;
  agentType: string;
  provider: string;
  newProvider?: CreateProviderRequest;
  warmPool: string;
  count: number;
  model: string;
}

export interface DeployResponse {
  status: string;
  namespace: string;
  sandboxes: string[];
}

export interface CreateProviderRequest {
  name: string;
  type: string;
  credentials: Record<string, string>;
  namespace: string;
}

export const PROVIDER_TYPES = [
  { id: 'google-vertex-ai', name: 'Google Vertex AI' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'custom', name: 'Custom' },
] as const;

export const AGENT_TYPES: AgentTypeInfo[] = [
  {
    name: 'claude',
    displayName: 'Claude Code',
    description: 'Anthropic Claude coding agent — works out of the box with ANTHROPIC_API_KEY or Vertex AI provider',
    image: 'base',
    sandbox: 'base',
  },
  {
    name: 'codex',
    displayName: 'Codex',
    description: 'OpenAI Codex coding agent — requires OPENAI_API_KEY',
    image: 'base',
    sandbox: 'base',
  },
  {
    name: 'opencode',
    displayName: 'OpenCode',
    description: 'Open-source coding agent — use with a configured provider',
    image: 'base',
    sandbox: 'base',
  },
  {
    name: 'copilot',
    displayName: 'GitHub Copilot CLI',
    description: 'GitHub Copilot in the CLI — requires GITHUB_TOKEN',
    image: 'base',
    sandbox: 'base',
  },
  {
    name: 'ollama',
    displayName: 'Ollama',
    description: 'Run cloud and local models — includes Claude Code, Codex, and OpenCode',
    image: 'ollama',
    sandbox: 'ollama',
  },
  {
    name: 'pi',
    displayName: 'Pi',
    description: 'Pi coding agent pre-installed',
    image: 'pi',
    sandbox: 'pi',
  },
  {
    name: 'hermes',
    displayName: 'Hermes Agent',
    description: 'NousResearch Hermes agentic framework with MCP tool integration',
    image: 'hermes',
    sandbox: 'base',
  },
];
