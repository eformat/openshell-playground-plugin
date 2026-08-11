import * as React from 'react';
import {
  EmptyState,
  EmptyStateBody,
  Icon,
  Label,
  Tooltip,
} from '@patternfly/react-core';
import {
  Table,
  Thead,
  Tr,
  Th,
  Tbody,
  Td,
} from '@patternfly/react-table';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  BanIcon,
} from '@patternfly/react-icons';
import { GlobalPolicyInfo, SandboxPolicyInfo } from '../utils/types';

interface PolicyTableProps {
  global: GlobalPolicyInfo;
  sandboxes: SandboxPolicyInfo[];
}

const PolicyStatusCell: React.FC<{ status: 'loaded' | 'failed' | 'none' }> = ({ status }) => {
  if (status === 'loaded') {
    return (
      <Flex>
        <Icon status="success" style={{ marginRight: '0.5rem' }}>
          <CheckCircleIcon />
        </Icon>
        Loaded
      </Flex>
    );
  }
  if (status === 'failed') {
    return (
      <span>
        <Icon status="danger" style={{ marginRight: '0.5rem' }}>
          <ExclamationCircleIcon />
        </Icon>
        Failed
      </span>
    );
  }
  return (
    <span style={{ color: 'var(--pf-v5-global--Color--200, #6a6e73)' }}>
      <Icon style={{ marginRight: '0.5rem' }}>
        <BanIcon />
      </Icon>
      None
    </span>
  );
};

// Inline Flex wrapper since we need it for PolicyStatusCell
const Flex: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center' }}>{children}</span>
);

const PolicyTable: React.FC<PolicyTableProps> = ({ global, sandboxes }) => {
  const rows: Array<{ name: string; scope: string; status: 'loaded' | 'failed' | 'none'; networkPolicies: number; pendingProposals: number }> = [];

  if (global.exists) {
    rows.push({
      name: '(global)',
      scope: 'Global',
      status: global.status,
      networkPolicies: global.network_policies,
      pendingProposals: 0,
    });
  }

  for (const sb of sandboxes) {
    rows.push({
      name: sb.name,
      scope: `Sandbox (${sb.workspace})`,
      status: sb.status,
      networkPolicies: sb.network_policies,
      pendingProposals: sb.pending_proposals,
    });
  }

  if (rows.length === 0) {
    return (
      <EmptyState>
        <EmptyStateBody>No policies found. Sandboxes use default-deny egress until a policy is set.</EmptyStateBody>
      </EmptyState>
    );
  }

  return (
    <Table aria-label="Policy list">
      <Thead>
        <Tr>
          <Th>Name</Th>
          <Th>Scope</Th>
          <Th>Status</Th>
          <Th>Network Policies</Th>
          <Th>Pending Proposals</Th>
        </Tr>
      </Thead>
      <Tbody>
        {rows.map((row) => (
          <Tr key={`${row.scope}-${row.name}`}>
            <Td>{row.name}</Td>
            <Td>
              <Label color={row.scope === 'Global' ? 'blue' : 'grey'} isCompact>
                {row.scope}
              </Label>
            </Td>
            <Td>
              <PolicyStatusCell status={row.status} />
            </Td>
            <Td>{row.networkPolicies}</Td>
            <Td>
              {row.pendingProposals > 0 ? (
                <Tooltip content="Proposals awaiting review in the Policy Advisor">
                  <Label color="orange" isCompact>
                    {row.pendingProposals} pending
                  </Label>
                </Tooltip>
              ) : (
                row.pendingProposals
              )}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
};

export default PolicyTable;
