import * as React from 'react';
import {
  Button,
  Alert,
  EmptyState,
  EmptyStateBody,
  Spinner,
} from '@patternfly/react-core';
import {
  Table,
  Thead,
  Tr,
  Th,
  Tbody,
  Td,
} from '@patternfly/react-table';
import { AgentInfo } from '../utils/types';
import * as api from '../utils/api';

interface AgentListProps {
  namespace: string;
  agents: AgentInfo[];
  loading: boolean;
  error: string;
  onOpenTerminal: (name: string, namespace: string) => void;
  onRefresh: () => void;
}

const AgentList: React.FC<AgentListProps> = ({
  namespace,
  agents,
  loading,
  error,
  onOpenTerminal,
  onRefresh,
}) => {
  const [deleteError, setDeleteError] = React.useState('');

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete sandbox ${name}?`)) return;
    setDeleteError('');
    try {
      await api.deleteAgent(name, namespace);
      onRefresh();
    } catch (err: any) {
      setDeleteError(err.message || 'Delete failed');
    }
  };

  const statusDot = (status: string) => {
    const cls = status.toLowerCase().replace(/\s+/g, '-');
    return <span className={`os-status-dot os-status-dot--${cls}`} />;
  };

  return (
    <div className="os-agent-list">
      {(error || deleteError) && (
        <Alert
          variant="danger"
          isInline
          title={error || deleteError}
          style={{ marginBottom: 12 }}
        />
      )}

      {!namespace ? (
        <EmptyState>
          <EmptyStateBody>Select a namespace to view agents.</EmptyStateBody>
        </EmptyState>
      ) : loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Spinner size="xl" />
        </div>
      ) : agents.length === 0 ? (
        <EmptyState>
          <EmptyStateBody>No sandboxes found in {namespace}.</EmptyStateBody>
        </EmptyState>
      ) : (
        <Table aria-label="Agent sandboxes" variant="compact">
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Agent</Th>
              <Th>Model</Th>
              <Th>Status</Th>
              <Th>Provider</Th>
              <Th>Age</Th>
              <Th>Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {agents.map((agent) => (
              <Tr key={agent.name}>
                <Td dataLabel="Name">{agent.name}</Td>
                <Td dataLabel="Agent">
                  <span style={{ textTransform: 'capitalize' }}>{agent.agentType || '—'}</span>
                </Td>
                <Td dataLabel="Model">
                  <code style={{ fontSize: 11 }}>{(agent as any).model || '—'}</code>
                </Td>
                <Td dataLabel="Status">
                  {statusDot(agent.status)}
                  {agent.status}
                </Td>
                <Td dataLabel="Provider">{agent.provider || '—'}</Td>
                <Td dataLabel="Age">{agent.age}</Td>
                <Td dataLabel="Actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    isDisabled={agent.status !== 'Running'}
                    onClick={() => onOpenTerminal(agent.name, agent.namespace)}
                    style={{ marginRight: 8 }}
                  >
                    Terminal
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(agent.name)}
                  >
                    Delete
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
};

export default AgentList;
