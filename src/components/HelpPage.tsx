import * as React from 'react';
import {
  PageSection,
  Title,
  Nav,
  NavExpandable,
  NavItem,
  NavList,
  Alert,
} from '@patternfly/react-core';
import { useHistory, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { topics, sections } from '../docs/topicRegistry';
import imageMap from '../docs/imageMap';
import './HelpPage.css';

const HELP_BASE = '/openshell/help';
const DEFAULT_TOPIC = 'getting-started';

function getTopicBySlug(slug: string) {
  return topics.find((t) => t.slug === slug);
}

const HelpPage: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const topicSlug = React.useMemo(() => {
    const match = location.pathname.match(/\/openshell\/help\/(.+)/);
    return match ? match[1] : DEFAULT_TOPIC;
  }, [location.pathname]);
  const activeTopic = getTopicBySlug(topicSlug) || getTopicBySlug(DEFAULT_TOPIC);

  const navigateToTopic = (slug: string) => {
    history.push(`${HELP_BASE}/${slug}`);
  };

  const currentIdx = topics.findIndex((t) => t.slug === activeTopic?.slug);
  const prevTopic = currentIdx > 0 ? topics[currentIdx - 1] : null;
  const nextTopic = currentIdx < topics.length - 1 ? topics[currentIdx + 1] : null;

  const mdComponents: Record<string, React.FC<any>> = {
    img: ({ src, alt, ...props }: { src?: string; alt?: string }) => {
      const resolved = src && imageMap[src] ? imageMap[src] : src;
      return (
        <img
          {...props}
          src={resolved}
          alt={alt || ''}
          style={{
            maxWidth: '100%',
            borderRadius: '4px',
            margin: '8px 0',
          }}
        />
      );
    },
    a: ({ href, children, ...props }: { href?: string; children?: React.ReactNode }) => {
      if (href && !href.startsWith('http') && !href.startsWith('#')) {
        const slug = href.replace(/^\.?\/?/, '').replace(/\.md$/, '');
        if (getTopicBySlug(slug)) {
          return (
            <a
              {...props}
              href={`${HELP_BASE}/${slug}`}
              onClick={(e) => {
                e.preventDefault();
                navigateToTopic(slug);
              }}
            >
              {children}
            </a>
          );
        }
      }
      return <a {...props} href={href} target={href?.startsWith('http') ? '_blank' : undefined} rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}>{children}</a>;
    },
    h1: ({ children }: { children?: React.ReactNode }) => (
      <Title headingLevel="h1" size="2xl" style={{ marginBottom: '16px', marginTop: '24px' }}>
        {children}
      </Title>
    ),
    h2: ({ children }: { children?: React.ReactNode }) => (
      <Title headingLevel="h2" size="xl" style={{ marginBottom: '12px', marginTop: '24px' }}>
        {children}
      </Title>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
      <Title headingLevel="h3" size="lg" style={{ marginBottom: '8px', marginTop: '16px' }}>
        {children}
      </Title>
    ),
    table: ({ children, ...props }: { children?: React.ReactNode }) => (
      <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
        <table {...props} className="os-help-table">{children}</table>
      </div>
    ),
    div: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => {
      if (className?.includes('alert-info')) {
        return <Alert variant="info" isInline isPlain title="" style={{ marginBottom: '12px' }}>{children}</Alert>;
      }
      if (className?.includes('alert-warning')) {
        return <Alert variant="warning" isInline isPlain title="" style={{ marginBottom: '12px' }}>{children}</Alert>;
      }
      if (className?.includes('alert-success')) {
        return <Alert variant="success" isInline isPlain title="" style={{ marginBottom: '12px' }}>{children}</Alert>;
      }
      if (className?.includes('alert')) {
        return <Alert variant="info" isInline isPlain title="" style={{ marginBottom: '12px' }}>{children}</Alert>;
      }
      return <div {...props} className={className}>{children}</div>;
    },
    p: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => {
      if (className === 'tip') {
        return <Alert variant="info" isInline isPlain title="Tip" style={{ marginBottom: '12px' }}>{children}</Alert>;
      }
      return <p {...props} className={className}>{children}</p>;
    },
    code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode; inline?: boolean }) => {
      const isBlock = className?.startsWith('language-') || (typeof children === 'string' && children.includes('\n'));
      if (isBlock) {
        return (
          <pre className="os-help-codeblock">
            <code {...props} className={className}>{children}</code>
          </pre>
        );
      }
      return <code {...props} className="os-help-inline-code">{children}</code>;
    },
    pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };

  if (!activeTopic) {
    return (
      <PageSection>
        <Alert variant="warning" title="Topic not found">
          The requested help topic was not found.
        </Alert>
      </PageSection>
    );
  }

  return (
    <div className="os-help-layout">
      <div className="os-help-sidebar">
        <div style={{ padding: '16px 16px 8px', fontWeight: 600, fontSize: '16px' }}>
          Help
        </div>
        <Nav>
          <NavList>
            {sections.map((section) => (
              <NavExpandable
                key={section}
                title={section}
                isExpanded
                groupId={section}
              >
                {topics
                  .filter((t) => t.section === section)
                  .map((t) => (
                    <NavItem
                      key={t.slug}
                      isActive={t.slug === activeTopic.slug}
                      href={`${HELP_BASE}/${t.slug}`}
                      onClick={(e) => { e.preventDefault(); navigateToTopic(t.slug); }}
                    >
                      {t.title}
                    </NavItem>
                  ))}
              </NavExpandable>
            ))}
          </NavList>
        </Nav>
      </div>

      <div className="os-help-content">
        <PageSection>
          <div className="os-help-markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={mdComponents}
            >
              {activeTopic.content}
            </ReactMarkdown>
          </div>

          <div className="os-help-pagination">
            {prevTopic ? (
              <a
                href={`${HELP_BASE}/${prevTopic.slug}`}
                onClick={(e) => { e.preventDefault(); navigateToTopic(prevTopic.slug); }}
                className="os-help-pagination-link"
              >
                &larr; {prevTopic.title}
              </a>
            ) : <span />}
            {nextTopic ? (
              <a
                href={`${HELP_BASE}/${nextTopic.slug}`}
                onClick={(e) => { e.preventDefault(); navigateToTopic(nextTopic.slug); }}
                className="os-help-pagination-link"
              >
                {nextTopic.title} &rarr;
              </a>
            ) : <span />}
          </div>
        </PageSection>
      </div>
    </div>
  );
};

export default HelpPage;
