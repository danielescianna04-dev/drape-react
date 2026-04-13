import React from 'react';
import { Platform } from 'react-native';
import { CollapsibleCodeBlock } from './CollapsibleCodeBlock';

export const markdownRules = {
  fence: (node: any) => {
    return (
      <CollapsibleCodeBlock
        key={node.key}
        content={node.content}
        language={node.source}
      />
    );
  },
  code_block: (node: any) => {
    return (
      <CollapsibleCodeBlock
        key={node.key}
        content={node.content}
      />
    );
  },
};

export const markdownStyles = {
  body: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 22,
    marginTop: 0,
    paddingTop: 0,
    borderWidth: 0,
  },
  heading1: {
    fontSize: 20,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.95)',
    marginBottom: 12,
    marginTop: 16,
  },
  heading2: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.95)',
    marginBottom: 10,
    marginTop: 14,
  },
  heading3: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.90)',
    marginBottom: 8,
    marginTop: 12,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 12,
    lineHeight: 22,
    borderBottomWidth: 0,
    borderWidth: 0,
  },
  strong: {
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.95)',
  },
  em: {
    fontStyle: 'italic',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  code_inline: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.95)',
  },
  code_block: {
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 12,
    marginVertical: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  fence: {
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 12,
    marginVertical: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  bullet_list: {
    marginBottom: 12,
  },
  ordered_list: {
    marginBottom: 12,
  },
  list_item: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  bullet_list_icon: {
    width: 20,
    marginRight: 8,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  ordered_list_icon: {
    width: 20,
    marginRight: 8,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(139, 148, 158, 0.5)',
    paddingLeft: 12,
    marginLeft: 0,
    marginVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    paddingVertical: 8,
  },
  hr: {
    backgroundColor: 'transparent',
    height: 0,
    marginVertical: 0,
    display: 'none',
  },
  link: {
    color: '#58A6FF',
    textDecorationLine: 'none',
    textDecorationStyle: 'solid',
    textDecorationColor: 'transparent',
    fontWeight: '600',
  },
  html_inline: {
    textDecorationLine: 'none',
  },
  html_block: {
    textDecorationLine: 'none',
  },
  softbreak: {
    textDecorationLine: 'none',
  },
  hardbreak: {
    textDecorationLine: 'none',
  },
  text: {
    textDecorationLine: 'none',
  },
  table: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    marginVertical: 8,
  },
  tr: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  th: {
    padding: 8,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.95)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  td: {
    padding: 8,
    color: 'rgba(255, 255, 255, 0.85)',
  },
};
