import * as React from 'react';
import {
  Card,
  CardBody,
  CardTitle,
  Grid,
  GridItem,
  Icon,
  Flex,
  FlexItem,
  Title,
  Tooltip,
} from '@patternfly/react-core';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  BanIcon,
} from '@patternfly/react-icons';
import { GovernancePoliciesResponse, ProposalInfo } from '../utils/types';

interface PolicySummaryCardsProps {
  policies: GovernancePoliciesResponse;
  proposals: ProposalInfo[];
}

const StatusIcon: React.FC<{ status: 'loaded' | 'failed' | 'none' }> = ({ status }) => {
  if (status === 'loaded') {
    return (
      <Icon status="success">
        <CheckCircleIcon />
      </Icon>
    );
  }
  if (status === 'failed') {
    return (
      <Icon status="danger">
        <ExclamationCircleIcon />
      </Icon>
    );
  }
  return (
    <Icon>
      <BanIcon />
    </Icon>
  );
};

const PolicySummaryCards: React.FC<PolicySummaryCardsProps> = ({ policies, proposals }) => {
  const { global, sandboxes } = policies;

  const loaded = sandboxes.filter((s) => s.status === 'loaded').length;
  const failed = sandboxes.filter((s) => s.status === 'failed').length;
  const noneCount = sandboxes.filter((s) => s.status === 'none').length;
  const pendingTotal = proposals.filter((p) => p.status === 'pending').length;

  return (
    <Grid hasGutter>
      {/* Global Policy Card */}
      <GridItem span={4}>
        <Card>
          <CardTitle>Global Policy</CardTitle>
          <CardBody>
            <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsMd' }}>
              <FlexItem>
                <StatusIcon status={global.status} />
              </FlexItem>
              <FlexItem>
                <Title headingLevel="h4" size="xl">
                  {global.exists ? global.status : 'Not set'}
                </Title>
                {global.exists && (
                  <span style={{ color: 'var(--pf-v5-global--Color--200, #6a6e73)', fontSize: '0.875rem' }}>
                    {global.network_policies} network {global.network_policies === 1 ? 'policy' : 'policies'}
                  </span>
                )}
              </FlexItem>
            </Flex>
          </CardBody>
        </Card>
      </GridItem>

      {/* Sandbox Policies Card */}
      <GridItem span={4}>
        <Card>
          <CardTitle>Sandbox Policies</CardTitle>
          <CardBody>
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
              <Tooltip content="Sandboxes with a loaded policy">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'default' }}>
                  <Icon status="success"><CheckCircleIcon /></Icon>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, lineHeight: 1 }}>{loaded}</span>
                  <span style={{ fontSize: '0.875rem', color: 'var(--pf-v5-global--Color--200, #6a6e73)' }}>Loaded</span>
                </div>
              </Tooltip>
              <span style={{ color: 'var(--pf-v5-global--Color--300, #d2d2d2)' }}>|</span>
              <Tooltip content="Sandboxes with a failed policy">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'default' }}>
                  <Icon status="danger"><ExclamationCircleIcon /></Icon>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, lineHeight: 1 }}>{failed}</span>
                  <span style={{ fontSize: '0.875rem', color: 'var(--pf-v5-global--Color--200, #6a6e73)' }}>Failed</span>
                </div>
              </Tooltip>
              <span style={{ color: 'var(--pf-v5-global--Color--300, #d2d2d2)' }}>|</span>
              <Tooltip content="Sandboxes with no policy set">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'default' }}>
                  <Icon><BanIcon /></Icon>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, lineHeight: 1 }}>{noneCount}</span>
                  <span style={{ fontSize: '0.875rem', color: 'var(--pf-v5-global--Color--200, #6a6e73)' }}>None</span>
                </div>
              </Tooltip>
            </div>
          </CardBody>
        </Card>
      </GridItem>

      {/* Pending Proposals Card */}
      <GridItem span={4}>
        <Card>
          <CardTitle>Policy Advisor</CardTitle>
          <CardBody>
            <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsMd' }}>
              <FlexItem>
                <Icon status={pendingTotal > 0 ? 'warning' : 'success'}>
                  {pendingTotal > 0 ? <ExclamationTriangleIcon /> : <CheckCircleIcon />}
                </Icon>
              </FlexItem>
              <FlexItem>
                <Title headingLevel="h4" size="xl">{pendingTotal}</Title>
                <span style={{ color: 'var(--pf-v5-global--Color--200, #6a6e73)', fontSize: '0.875rem' }}>
                  {pendingTotal === 1 ? 'proposal' : 'proposals'} pending review
                </span>
              </FlexItem>
            </Flex>
          </CardBody>
        </Card>
      </GridItem>
    </Grid>
  );
};

export default PolicySummaryCards;
