import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';

interface CommandCardProps {
  /** Command text to display */
  command: string;
  /** Optional output text */
  output?: string;
  /** Whether command is currently running */
  isRunning?: boolean;
  /** Background color for the card */
  backgroundColor?: string;
}

/**
 * Displays a terminal command with optional output
 * Used in terminal views to show command history
 */
export const CommandCard: React.FC<CommandCardProps> = ({
  command,
  output,
  isRunning = false,
  backgroundColor = 'rgba(255, 255, 255, 0.05)',
}) => {
  const renderContent = () => (
    <>
      <View style={styles.commandRow}>
        <Text style={styles.prompt}>$</Text>
        <Text style={styles.command}>{command}</Text>
        {isRunning && <Text style={styles.cursor}>▊</Text>}
      </View>
      {output && <Text style={styles.output}>{output}</Text>}
    </>
  );

  if (isLiquidGlassSupported) {
    return (
      <LiquidGlassView
        style={[styles.container, { backgroundColor: 'transparent', overflow: 'hidden' }]}
        interactive={true}
        effect="clear"
        colorScheme="dark"
      >
        <View style={{ padding: 12 }}>
          {renderContent()}
        </View>
      </LiquidGlassView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {renderContent()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 0, // Padding handled by inner View if glass
    borderRadius: 8,
    marginVertical: 4,
  },
  commandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  prompt: {
    fontSize: 14,
    color: '#00D084',
    fontFamily: 'Courier New',
    marginRight: 8,
    fontWeight: '600',
  },
  command: {
    fontSize: 14,
    color: '#fff',
    fontFamily: 'Courier New',
    flex: 1,
  },
  cursor: {
    fontSize: 14,
    color: '#fff',
    fontFamily: 'Courier New',
    marginLeft: 2,
  },
  output: {
    fontSize: 13,
    color: '#aaa',
    fontFamily: 'Courier New',
    marginTop: 8,
    lineHeight: 18,
  },
});
