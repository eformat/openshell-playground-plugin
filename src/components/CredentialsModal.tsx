import * as React from 'react';
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Button,
  FormGroup,
  TextInput,
  FormSelect,
  FormSelectOption,
  FileUpload,
  Alert,
} from '@patternfly/react-core';
import { PROVIDER_TYPES } from '../utils/types';
import * as api from '../utils/api';

interface CredentialsModalProps {
  isOpen: boolean;
  namespace: string;
  gateway?: string;
  onClose: () => void;
  onCreated: (providerName: string) => void;
}

const CredentialsModal: React.FC<CredentialsModalProps> = ({
  isOpen,
  namespace,
  gateway,
  onClose,
  onCreated,
}) => {
  const [providerType, setProviderType] = React.useState('google-vertex-ai');
  const [providerName, setProviderName] = React.useState('');
  const [apiKey, setApiKey] = React.useState('');
  const [gcpProjectId, setGcpProjectId] = React.useState('');
  const [gcpRegion, setGcpRegion] = React.useState('global');
  const [gcpFile, setGcpFile] = React.useState('');
  const [gcpFilename, setGcpFilename] = React.useState('');
  const [baseUrl, setBaseUrl] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const resetForm = () => {
    setProviderType('google-vertex-ai');
    setProviderName('');
    setApiKey('');
    setGcpProjectId('');
    setGcpRegion('global');
    setGcpFile('');
    setGcpFilename('');
    setBaseUrl('');
    setError('');
  };

  const handleSubmit = async () => {
    if (!providerName.trim()) {
      setError('Provider name is required');
      return;
    }
    setLoading(true);
    setError('');

    const credentials: Record<string, string> = {};
    if (providerType === 'google-vertex-ai') {
      if (gcpProjectId) credentials['VERTEX_AI_PROJECT_ID'] = gcpProjectId;
      if (gcpRegion) credentials['VERTEX_AI_REGION'] = gcpRegion;
      if (gcpFile) credentials['GOOGLE_APPLICATION_CREDENTIALS_JSON'] = gcpFile;
    } else if (providerType === 'anthropic') {
      if (apiKey) credentials['ANTHROPIC_API_KEY'] = apiKey;
    } else if (providerType === 'openai') {
      if (apiKey) credentials['OPENAI_API_KEY'] = apiKey;
      if (baseUrl) credentials['OPENAI_BASE_URL'] = baseUrl;
    } else {
      if (apiKey) credentials['API_KEY'] = apiKey;
      if (baseUrl) credentials['BASE_URL'] = baseUrl;
    }

    try {
      await api.createProvider({
        name: providerName.trim(),
        type: providerType,
        gateway,
        credentials,
        namespace,
      });
      onCreated(providerName.trim());
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Failed to create provider');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} variant="medium">
      <ModalHeader title="Create Provider" />
      <ModalBody>
        {error && (
          <Alert variant="danger" isInline title={error} style={{ marginBottom: 16 }} />
        )}

        <FormGroup label="Provider Type" isRequired fieldId="provider-type" style={{ marginBottom: 16 }}>
          <FormSelect
            id="provider-type"
            value={providerType}
            onChange={(_e, val) => setProviderType(val)}
          >
            {PROVIDER_TYPES.map((pt) => (
              <FormSelectOption key={pt.id} value={pt.id} label={pt.name} />
            ))}
          </FormSelect>
        </FormGroup>

        <FormGroup label="Provider Name" isRequired fieldId="provider-name" style={{ marginBottom: 16 }}>
          <TextInput
            id="provider-name"
            value={providerName}
            onChange={(_e, val) => setProviderName(val)}
            placeholder="e.g. vertex-prod"
          />
        </FormGroup>

        {providerType === 'google-vertex-ai' && (
          <>
            <FormGroup label="GCP Project ID" fieldId="gcp-project" style={{ marginBottom: 12 }}>
              <TextInput
                id="gcp-project"
                value={gcpProjectId}
                onChange={(_e, val) => setGcpProjectId(val)}
                placeholder="my-gcp-project"
              />
            </FormGroup>
            <FormGroup label="Region" fieldId="gcp-region" style={{ marginBottom: 12 }}>
              <TextInput
                id="gcp-region"
                value={gcpRegion}
                onChange={(_e, val) => setGcpRegion(val)}
                placeholder="global"
              />
            </FormGroup>
            <FormGroup label="Service Account JSON (optional)" fieldId="gcp-sa">
              <FileUpload
                id="gcp-sa"
                type="text"
                value={gcpFile}
                filename={gcpFilename}
                onTextChange={(_e, val) => setGcpFile(val)}
                onFileInputChange={(_e, file) => setGcpFilename(file.name)}
                onDataChange={(_e, val) => setGcpFile(val)}
                browseButtonText="Upload JSON"
              />
            </FormGroup>
          </>
        )}

        {providerType === 'anthropic' && (
          <FormGroup label="Anthropic API Key" fieldId="anthropic-key">
            <TextInput
              id="anthropic-key"
              type="password"
              value={apiKey}
              onChange={(_e, val) => setApiKey(val)}
              placeholder="sk-ant-..."
            />
          </FormGroup>
        )}

        {providerType === 'openai' && (
          <>
            <FormGroup label="API Key" fieldId="openai-key" style={{ marginBottom: 12 }}>
              <TextInput
                id="openai-key"
                type="password"
                value={apiKey}
                onChange={(_e, val) => setApiKey(val)}
                placeholder="sk-..."
              />
            </FormGroup>
            <FormGroup label="Base URL (optional)" fieldId="openai-url">
              <TextInput
                id="openai-url"
                value={baseUrl}
                onChange={(_e, val) => setBaseUrl(val)}
                placeholder="https://api.openai.com/v1"
              />
            </FormGroup>
          </>
        )}

        {providerType === 'custom' && (
          <>
            <FormGroup label="API Key" fieldId="custom-key" style={{ marginBottom: 12 }}>
              <TextInput
                id="custom-key"
                type="password"
                value={apiKey}
                onChange={(_e, val) => setApiKey(val)}
                placeholder="API key"
              />
            </FormGroup>
            <FormGroup label="Base URL" fieldId="custom-url">
              <TextInput
                id="custom-url"
                value={baseUrl}
                onChange={(_e, val) => setBaseUrl(val)}
                placeholder="https://..."
              />
            </FormGroup>
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={handleSubmit}
          isLoading={loading}
          isDisabled={loading || !providerName.trim()}
        >
          Create Provider
        </Button>
        <Button variant="link" onClick={handleClose} isDisabled={loading}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default CredentialsModal;
