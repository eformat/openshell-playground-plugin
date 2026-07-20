import gettingStarted from './getting-started.md';
import gateways from './gateways.md';
import providers from './providers.md';
import agentList from './agent-list.md';
import openshellTui from './openshell-tui.md';
import terminals from './terminals.md';

export interface HelpTopic {
  slug: string;
  title: string;
  section: 'User Guide' | 'Reference';
  content: string;
}

export const sections = ['User Guide', 'Reference'] as const;

export const topics: HelpTopic[] = [
  { slug: 'getting-started', title: 'Getting Started', section: 'User Guide', content: gettingStarted },
  { slug: 'gateways', title: 'Gateway Configuration', section: 'User Guide', content: gateways },
  { slug: 'providers', title: 'Provider Configuration', section: 'User Guide', content: providers },
  { slug: 'agent-list', title: 'Agent List & Sandboxes', section: 'User Guide', content: agentList },
  { slug: 'openshell-tui', title: 'OpenShell TUI', section: 'User Guide', content: openshellTui },
  { slug: 'terminals', title: 'Agent Terminals', section: 'Reference', content: terminals },
];
