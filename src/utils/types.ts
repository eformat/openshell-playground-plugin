export interface AgentTypeInfo {
  name: string;
  displayName: string;
  description: string;
  image: string;
  sandbox: string;
  models: { id: string; label: string }[];
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
  gateway: string;
  agentType: string;
  agentLabel: string;
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
  gateway?: string;
  credentials: Record<string, string>;
  namespace: string;
}

export const PROVIDER_TYPES = [
  { id: 'google-vertex-ai', name: 'Google Vertex AI' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'openai', name: 'OpenAI / OpenAI-Compatible' },
] as const;

export const AGENT_TYPES: AgentTypeInfo[] = [
  {
    name: 'claude',
    displayName: 'Claude Code',
    description: 'Anthropic Claude coding agent — works out of the box with ANTHROPIC_API_KEY or Vertex AI provider',
    image: 'base',
    sandbox: 'base',
    models: [
      { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6 (1M)' },
      { id: 'claude-sonnet-5', label: 'Sonnet 5 (1M)' },
      { id: 'claude-opus-4-6', label: 'Opus 4.6 (1M)' },
      { id: 'claude-opus-4-7', label: 'Opus 4.7 (1M)' },
      { id: 'claude-opus-4-8', label: 'Opus 4.8 (1M)' },
      { id: 'claude-fable-5', label: 'Fable 5 (1M)' },
      { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 (200k)' },
    ],
  },
  {
    name: 'codex',
    displayName: 'Codex',
    description: 'OpenAI Codex coding agent — requires OPENAI_API_KEY',
    image: 'base',
    sandbox: 'base',
    models: [
      { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
      { id: 'gpt-5.4', label: 'GPT-5.4' },
      { id: 'o3', label: 'o3' },
      { id: 'o4-mini', label: 'o4-mini' },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
    ],
  },
  {
    name: 'opencode',
    displayName: 'OpenCode',
    description: 'Open-source coding agent — use with a configured provider',
    image: 'base',
    sandbox: 'base',
    models: [
      { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
      { id: 'claude-opus-4-7', label: 'Opus 4.7' },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
    ],
  },
  {
    name: 'copilot',
    displayName: 'GitHub Copilot CLI',
    description: 'GitHub Copilot in the CLI — requires GITHUB_TOKEN',
    image: 'base',
    sandbox: 'base',
    models: [
      { id: 'default', label: 'Default' },
    ],
  },
  {
    name: 'ollama',
    displayName: 'Ollama',
    description: 'Run cloud and local models — includes Claude Code, Codex, and OpenCode',
    image: 'ollama',
    sandbox: 'ollama',
    models: [
      { id: 'default', label: 'Default' },
    ],
  },
  {
    name: 'pi',
    displayName: 'Pi',
    description: 'Pi coding agent pre-installed',
    image: 'pi',
    sandbox: 'pi',
    models: [
      { id: 'default', label: 'Default' },
    ],
  },
  {
    name: 'hermes',
    displayName: 'Hermes Agent',
    description: 'NousResearch Hermes agentic framework with MCP tool integration',
    image: 'hermes',
    sandbox: 'base',
    models: [
      { id: 'default', label: 'Default' },
    ],
  },
];
