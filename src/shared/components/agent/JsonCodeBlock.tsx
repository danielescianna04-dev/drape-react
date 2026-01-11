import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { AppColors } from '../../theme/colors';

const colors = AppColors.dark;

interface JsonCodeBlockProps {
  code: string | object;
}

export const JsonCodeBlock: React.FC<JsonCodeBlockProps> = ({ code }) => {
  // Convert object to string if needed
  let jsonString = typeof code === 'string' ? code : JSON.stringify(code, null, 2);

  // Try to parse and re-format if it's a JSON string
  try {
    if (typeof code === 'string') {
      const parsed = JSON.parse(code);
      jsonString = JSON.stringify(parsed, null, 2);
    }
  } catch {
    // Keep original if not valid JSON
  }

  // Simple syntax highlighting by coloring different parts
  const renderHighlightedJson = (json: string) => {
    const lines = json.split('\n');

    return lines.map((line, lineIndex) => {
      const parts: React.ReactNode[] = [];
      let currentIndex = 0;

      // Match patterns for highlighting
      const patterns = [
        // String values (after colon)
        { regex: /: "([^"]*?)"/g, style: styles.string, group: 1, prefix: ': "', suffix: '"' },
        // Keys
        { regex: /"([^"]*?)":/g, style: styles.key, group: 1, prefix: '"', suffix: '":' },
        // Numbers
        { regex: /: (-?\d+\.?\d*)/g, style: styles.number, group: 1, prefix: ': ', suffix: '' },
        // Booleans
        { regex: /: (true|false)/g, style: styles.boolean, group: 1, prefix: ': ', suffix: '' },
        // Null
        { regex: /: (null)/g, style: styles.null, group: 1, prefix: ': ', suffix: '' },
      ];

      // Find all matches in the line
      const matches: Array<{ start: number; end: number; text: string; style: any }> = [];

      patterns.forEach(({ regex, style, group, prefix, suffix }) => {
        let match;
        const regexCopy = new RegExp(regex.source, regex.flags);

        while ((match = regexCopy.exec(line)) !== null) {
          const fullMatch = match[0];
          const groupMatch = match[group];
          const startOfGroup = match.index + prefix.length;

          matches.push({
            start: startOfGroup,
            end: startOfGroup + groupMatch.length,
            text: groupMatch,
            style,
          });
        }
      });

      // Sort matches by start position
      matches.sort((a, b) => a.start - b.start);

      // Build the line with highlighted parts
      let pos = 0;
      matches.forEach((match, index) => {
        // Add text before match
        if (match.start > pos) {
          parts.push(
            <Text key={`plain-${lineIndex}-${index}`} style={styles.plain}>
              {line.substring(pos, match.start)}
            </Text>
          );
        }

        // Add highlighted match
        parts.push(
          <Text key={`match-${lineIndex}-${index}`} style={match.style}>
            {match.text}
          </Text>
        );

        pos = match.end;
      });

      // Add remaining text
      if (pos < line.length) {
        parts.push(
          <Text key={`plain-${lineIndex}-end`} style={styles.plain}>
            {line.substring(pos)}
          </Text>
        );
      }

      return (
        <Text key={lineIndex} style={styles.line}>
          {parts.length > 0 ? parts : <Text style={styles.plain}>{line}</Text>}
        </Text>
      );
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.code}>
        {renderHighlightedJson(jsonString)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  code: {
    fontFamily: 'Courier',
    fontSize: 12,
    lineHeight: 18,
  },
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  plain: {
    color: '#ABB2BF', // Light gray for brackets, commas, etc.
  },
  key: {
    color: '#E06C75', // Red for keys
    fontWeight: '600',
  },
  string: {
    color: '#98C379', // Green for string values
  },
  number: {
    color: '#D19A66', // Orange for numbers
  },
  boolean: {
    color: '#C678DD', // Purple for booleans
  },
  null: {
    color: '#56B6C2', // Cyan for null
  },
});
