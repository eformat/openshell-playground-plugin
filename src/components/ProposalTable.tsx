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
  ExclamationTriangleIcon,
  InfoCircleIcon,
} from '@patternfly/react-icons';
import { ProposalInfo } from '../utils/types';

interface ProposalTableProps {
  proposals: ProposalInfo[];
}

const FINDING_LABELS: Record<string, string> = {
  link_local_reach: 'Link-local reach',
  l7_bypass_credentialed: 'L7 bypass (credentialed)',
  credential_reach_expansion: 'Credential reach expansion',
  capability_expansion: 'Capability expansion',
};

const ProposalStatusCell: React.FC<{ status: ProposalInfo['status'] }> = ({ status }) => {
  if (status === 'approved') {
    return (
      <span>
        <Icon status="success" style={{ marginRight: '0.5rem' }}>
          <CheckCircleIcon />
        </Icon>
        Approved
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span>
        <Icon status="danger" style={{ marginRight: '0.5rem' }}>
          <ExclamationCircleIcon />
        </Icon>
        Rejected
      </span>
    );
  }
  return (
    <span>
      <Icon status="warning" style={{ marginRight: '0.5rem' }}>
        <ExclamationTriangleIcon />
      </Icon>
      Pending review
    </span>
  );
};

const ProposalTable: React.FC<ProposalTableProps> = ({ proposals }) => {
  if (proposals.length === 0) {
    return (
      <EmptyState>
        <EmptyStateBody>
          No pending proposals. When a sandboxed agent requests a new network rule, it will appear here for review.
        </EmptyStateBody>
      </EmptyState>
    );
  }

  return (
    <Table aria-label="Policy proposals">
      <Thead>
        <Tr>
          <Th>Sandbox</Th>
          <Th>Endpoint</Th>
          <Th>Intent Summary</Th>
          <Th>Status</Th>
          <Th>
            Prover Findings
            <Tooltip
              content="Findings from the policy prover. Each category is a security concern that blocks auto-approval."
            >
              <Icon style={{ marginLeft: '0.375rem' }}>
                <InfoCircleIcon />
              </Icon>
            </Tooltip>
          </Th>
        </Tr>
      </Thead>
      <Tbody>
        {proposals.map((proposal, idx) => (
          <Tr key={proposal.id || `${proposal.sandbox}-${idx}`}>
            <Td>
              <Label color="grey" isCompact>{proposal.sandbox}</Label>
            </Td>
            <Td>
              <code style={{ fontSize: '0.8rem' }}>{proposal.endpoints || '—'}</code>
            </Td>
            <Td>{proposal.intent_summary || '—'}</Td>
            <Td>
              <ProposalStatusCell status={proposal.status} />
            </Td>
            <Td>
              {proposal.prover_findings && proposal.prover_findings.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                  {proposal.prover_findings.map((f, fi) => (
                    <Tooltip key={fi} content={f.detail || f.category}>
                      <Label color="red" isCompact>
                        {FINDING_LABELS[f.category] ?? f.category}
                      </Label>
                    </Tooltip>
                  ))}
                </div>
              ) : (
                <span style={{ color: 'var(--pf-v5-global--Color--200, #6a6e73)' }}>None</span>
              )}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
};

export default ProposalTable;
