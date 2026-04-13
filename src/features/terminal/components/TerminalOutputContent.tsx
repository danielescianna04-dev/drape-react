import React from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { TerminalItem as TerminalItemType } from '../../../shared/types';
import { AppColors } from '../../../shared/theme/colors';
import { isTerminalCommandItem } from './terminalItemUtils';
import { markdownRules, markdownStyles } from './terminalMarkdown';

interface Props {
  item: TerminalItemType;
  styles: any;
  t: (key: string, options?: any) => string;
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
  isExecuting: boolean;
  executingDots: string;
  pulseAnim: Animated.Value;
  showThinking: boolean;
  thinkingDisplayText: string;
  thinkingPulseOpacity: any;
  thinkingDotOpacity1: any;
  thinkingDotOpacity2: any;
  thinkingDotOpacity3: any;
  handleCopy: (text: string) => Promise<void>;
  copiedFeedback: boolean;
}

export const TerminalOutputContent = ({
  item,
  styles,
  t,
  isExpanded,
  setIsExpanded,
  isExecuting,
  executingDots,
  pulseAnim,
  showThinking,
  thinkingDisplayText,
  thinkingPulseOpacity,
  thinkingDotOpacity1,
  thinkingDotOpacity2,
  thinkingDotOpacity3,
  handleCopy,
  copiedFeedback,
}: Props) => (
  isExecuting ? (
    (() => {
      const content = item.content || '';
      const lines = content.split('\n');
      const header = lines[0] || '';
      const statusLine = lines[1] || '';
      const animatedStatus = statusLine.replace(/\.\.\./, executingDots);

      let badgeColor = AppColors.primary;
      let badgeText = t('terminal:terminalItem.loadingBadge');
      let iconName: any = 'hourglass-outline';

      if (header.startsWith('Read ')) {
        badgeColor = '#58A6FF';
        badgeText = t('terminal:terminalItem.badges.read');
        iconName = 'document-text-outline';
      } else if (header.startsWith('Write ')) {
        badgeColor = '#3FB950';
        badgeText = t('terminal:terminalItem.badges.write');
        iconName = 'document-text-outline';
      } else if (header.startsWith('Edit ')) {
        badgeColor = '#3FB950';
        badgeText = t('terminal:terminalItem.badges.edit');
        iconName = 'create-outline';
      } else if (header.startsWith('Multi-edit ')) {
        badgeColor = '#3FB950';
        badgeText = t('terminal:terminalItem.badges.multiEdit');
        iconName = 'create-outline';
      } else if (header.startsWith('Patch ')) {
        badgeColor = '#3FB950';
        badgeText = t('terminal:terminalItem.badges.patch');
        iconName = 'create-outline';
      } else if (header.startsWith('List files')) {
        badgeColor = '#A371F7';
        badgeText = t('terminal:terminalItem.badges.list');
        iconName = 'folder-open-outline';
      } else if (header.startsWith('Search ') || header.startsWith('Glob ') || header.startsWith('glob_search')) {
        badgeColor = '#A371F7';
        badgeText = (header.startsWith('Glob ') || header.startsWith('glob_search'))
          ? t('terminal:terminalItem.badges.glob')
          : t('terminal:terminalItem.badges.search');
        iconName = 'search-outline';
      } else if (header.startsWith('Run command')) {
        badgeColor = '#3FB950';
        badgeText = t('terminal:terminalItem.badges.command');
        iconName = 'terminal';
      } else if (header.startsWith('Web search')) {
        badgeColor = '#58A6FF';
        badgeText = t('terminal:terminalItem.badges.web');
        iconName = 'globe-outline';
      } else if (header.startsWith('Fetch URL') || header.startsWith('Fetch:') || header.startsWith('web_fetch')) {
        badgeColor = '#58A6FF';
        badgeText = t('terminal:terminalItem.badges.fetch');
        iconName = 'cloud-download-outline';
      } else if (header.startsWith('User Question')) {
        badgeColor = '#FFA657';
        badgeText = t('terminal:terminalItem.badges.qa');
        iconName = 'help-circle-outline';
      } else if (header.startsWith('Todo List')) {
        badgeColor = '#FFA657';
        badgeText = t('terminal:terminalItem.badges.todo');
        iconName = 'checkbox-outline';
      } else if (header.startsWith('Agent:')) {
        badgeColor = '#BC8CFF';
        badgeText = t('terminal:terminalItem.badges.agent');
        iconName = 'flash-outline';
      } else if (header.startsWith('Diagnostics')) {
        badgeColor = '#FFA657';
        badgeText = 'DIAG';
        iconName = 'warning-outline';
      } else if (header.startsWith('LSP:')) {
        badgeColor = '#FFA657';
        badgeText = 'LSP';
        iconName = 'code-outline';
      } else if (header.startsWith('Skill')) {
        badgeColor = '#BC8CFF';
        badgeText = 'SKILL';
        iconName = 'book-outline';
      }

      const labelParts = header.split(' ');
      const label = labelParts.slice(1).join(' ') || '';

      return (
        <Animated.View style={{ opacity: pulseAnim }}>
          <View style={styles.readFileInline}>
            <View style={[styles.toolBadge, { backgroundColor: `${badgeColor}15`, borderColor: `${badgeColor}30` }]}>
              <Ionicons name={iconName} size={12} color={badgeColor} />
              <Text style={[styles.toolBadgeText, { color: badgeColor }]}>{badgeText}</Text>
            </View>
            {label && <Text style={styles.readFileName}>{label}</Text>}
          </View>
          {animatedStatus && (
            <Text style={[styles.executingStatus, { color: badgeColor }]}>
              {animatedStatus}
            </Text>
          )}
        </Animated.View>
      );
    })()
  ) : (item.content || '').startsWith('Read ') ? (
    (() => {
      const content = item.content || '';
      const lines = content.split('\n');
      const fullHeader = lines[0];
      const fileName = fullHeader.replace('Read ', '');

      return (
        <View style={styles.readFileInline}>
          <View style={styles.toolBadge}>
            <Ionicons name="document-text-outline" size={12} color="#58A6FF" />
            <Text style={styles.toolBadgeText}>{t('terminal:terminalItem.badges.read')}</Text>
          </View>
          <Text style={styles.readFileName}>{fileName}</Text>
        </View>
      );
    })()
  ) : ((item.content || '').startsWith('Glob ') || (item.content || '').startsWith('glob_search')) ? (
    (() => {
      const content = item.content || '';
      const contentLines = content.split('\n');
      const fullHeader = contentLines[0];
      const pattern = fullHeader.replace('Glob pattern: ', '').replace('glob_search', '').trim() || '*';
      const stats = contentLines[1];
      const fileLines = contentLines.slice(3).filter((line) => line.trim());
      const files = fileLines.map((line) => {
        let name = line.trim();
        name = name.replace(/^\/home\/coder\/project\/?/, '');
        if (!name) return null;
        const isDir = name.endsWith('/');
        return { name: isDir ? name.slice(0, -1) : name, isDir };
      }).filter(Boolean) as { name: string; isDir: boolean }[];

      return (
        <View>
          <View style={styles.readFileInline}>
            <View style={[styles.toolBadge, styles.toolBadgeGlob]}>
              <Ionicons name="search-outline" size={12} color="#A371F7" />
              <Text style={[styles.toolBadgeText, { color: '#A371F7' }]}>{t('terminal:terminalItem.badges.glob')}</Text>
            </View>
            <Text style={styles.readFileName}>{pattern}</Text>
            {stats && (
              <Text style={[styles.readFileName, { color: 'rgba(255,255,255,0.5)', marginLeft: 8 }]}>
                {stats.replace('└─ ', '')}
              </Text>
            )}
          </View>

          {files.length > 0 && (
            <View style={styles.fileListCard}>
              {files.slice(0, isExpanded ? undefined : 6).map((file, index) => (
                <View key={index} style={styles.fileListItem}>
                  <Ionicons
                    name={file.isDir ? 'folder' : 'document-text-outline'}
                    size={14}
                    color={file.isDir ? '#A371F7' : '#8B949E'}
                  />
                  <Text style={[styles.fileListName, file.isDir && { color: '#A371F7' }]} numberOfLines={1}>
                    {file.name}
                  </Text>
                </View>
              ))}

              {!isExpanded && files.length > 6 && (
                <TouchableOpacity onPress={() => setIsExpanded(true)} style={styles.showMoreButton}>
                  <Text style={styles.showMoreText}>Show {files.length - 6} more files</Text>
                  <Ionicons name="chevron-down" size={14} color="#8B949E" />
                </TouchableOpacity>
              )}

              {isExpanded && files.length > 6 && (
                <TouchableOpacity onPress={() => setIsExpanded(false)} style={styles.showLessButton}>
                  <Text style={styles.showMoreText}>{t('common:showLess')}</Text>
                  <Ionicons name="chevron-up" size={14} color="#8B949E" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      );
    })()
  ) : (item.content || '').startsWith('Edit ') ? (
    (() => {
      const lines = (item.content || '').split('\n');
      const editHeader = lines[0];
      const editSubheader = lines[1];
      const codeLines = lines.slice(2);
      const fileName = editHeader.replace('Edit ', '');
      const isError = editSubheader && editSubheader.includes('Error:');
      const nonEmptyCodeLines = codeLines.filter((line) => line.trim() !== '');
      const hasDiff = !isError && nonEmptyCodeLines.length > 0;

      return (
        <View>
          <View style={styles.readFileInline}>
            <View style={[styles.toolBadge, styles.toolBadgeEdit]}>
              <Ionicons name="create-outline" size={12} color="#3FB950" />
              <Text style={[styles.toolBadgeText, { color: '#3FB950' }]}>{t('terminal:terminalItem.badges.edit')}</Text>
            </View>
            <Text style={styles.readFileName}>{fileName}</Text>
          </View>

          {hasDiff && (
            <View style={[styles.editCard, !isExpanded && { maxHeight: 'auto' }]}>
              <View style={styles.editContent}>
                {nonEmptyCodeLines.slice(0, isExpanded ? undefined : 4).map((line, index) => {
                  const isAddedLine = line.startsWith('+ ');
                  const isRemovedLine = line.startsWith('- ');
                  const isContextLine = line.startsWith('  ');

                  let lineNumber = null;
                  let lineText = line;
                  const lineMatch = line.match(/^([+\- ]) (\d+): (.*)$/);
                  if (lineMatch) {
                    lineNumber = lineMatch[2];
                    lineText = `${lineMatch[1]} ${lineMatch[3]}`;
                  }

                  return (
                    <View
                      key={index}
                      style={[
                        styles.diffLine,
                        isAddedLine && styles.addedLine,
                        isRemovedLine && styles.removedLine,
                      ]}
                    >
                      {lineNumber && <Text style={styles.lineNumber}>{lineNumber}</Text>}
                      <Text
                        style={[
                          styles.terminalOutputLine,
                          isAddedLine && { color: '#3FB950' },
                          isRemovedLine && { color: '#F85149' },
                          isContextLine && { color: '#8B949E' },
                        ]}
                      >
                        {lineText}
                      </Text>
                    </View>
                  );
                })}

                {!isExpanded && nonEmptyCodeLines.length > 4 && (
                  <View style={styles.expandOverlay}>
                    <LinearGradient colors={['transparent', 'rgba(20, 20, 20, 0.95)']} style={styles.gradientOverlay} />
                    <TouchableOpacity onPress={() => setIsExpanded(true)} style={styles.showMoreButton}>
                      <Text style={styles.showMoreText}>{t('terminal:terminalItem.showMoreLines', { count: nonEmptyCodeLines.length - 4 })}</Text>
                      <Ionicons name="chevron-down" size={14} color="#8B949E" />
                    </TouchableOpacity>
                  </View>
                )}

                {isExpanded && nonEmptyCodeLines.length > 4 && (
                  <TouchableOpacity onPress={() => setIsExpanded(false)} style={styles.showLessButton}>
                    <Text style={styles.showMoreText}>{t('common:showLess')}</Text>
                    <Ionicons name="chevron-up" size={14} color="#8B949E" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </View>
      );
    })()
  ) : (item.content || '').startsWith('Write ') ? (
    (() => {
      const lines = (item.content || '').split('\n');
      const writeHeader = lines[0];
      const writeSubheader = lines[1];
      const fileName = writeHeader.replace('Write ', '');
      const isError = writeSubheader && writeSubheader.includes('Error:');
      const statusText = writeSubheader ? writeSubheader.replace('└─ ', '') : '';

      return (
        <View>
          <View style={styles.readFileInline}>
            <View style={[styles.toolBadge, styles.toolBadgeWrite]}>
              <Ionicons name="document-text-outline" size={12} color="#3FB950" />
              <Text style={[styles.toolBadgeText, { color: '#3FB950' }]}>{t('terminal:terminalItem.badges.write')}</Text>
            </View>
            <Text style={styles.readFileName}>{fileName}</Text>
          </View>
          {statusText && (
            <Text style={[styles.writeStatus, isError && { color: '#F85149' }]}>
              {statusText}
            </Text>
          )}
        </View>
      );
    })()
  ) : ((item.content || '').startsWith('Multi-edit ') || (item.content || '').startsWith('Patch ')) ? (
    (() => {
      const content = item.content || '';
      const lines = content.split('\n');
      const header = lines[0];
      const subheader = lines[1];
      const isMultiEdit = header.startsWith('Multi-edit ');
      const fileName = isMultiEdit ? header.replace('Multi-edit ', '') : header.replace('Patch ', '');
      const badgeText = isMultiEdit ? 'MULTI-EDIT' : 'PATCH';
      const isError = subheader && subheader.includes('Error:');
      const diffLines = lines.slice(2).filter((line) => line.trim() !== '');
      const hasDiff = !isError && diffLines.length > 0;

      return (
        <View>
          <View style={styles.readFileInline}>
            <View style={[styles.toolBadge, styles.toolBadgeEdit]}>
              <Ionicons name="create-outline" size={12} color="#3FB950" />
              <Text style={[styles.toolBadgeText, { color: '#3FB950' }]}>{badgeText}</Text>
            </View>
            <Text style={styles.readFileName}>{fileName}</Text>
          </View>

          {subheader && (
            <Text style={[styles.writeStatus, isError && { color: '#F85149' }]}>
              {subheader.replace('└─ ', '')}
            </Text>
          )}

          {hasDiff && (
            <View style={[styles.editCard, !isExpanded && { maxHeight: 'auto' }]}>
              <View style={styles.editContent}>
                {diffLines.slice(0, isExpanded ? undefined : 6).map((line, index) => {
                  const isAddedLine = line.startsWith('+ ');
                  const isRemovedLine = line.startsWith('- ');
                  const isEditLabel = line.startsWith('Edit ');

                  if (isEditLabel) {
                    return (
                      <Text key={index} style={{ color: '#8B949E', fontSize: 11, fontWeight: '600', marginTop: index > 0 ? 6 : 0, marginBottom: 2 }}>
                        {line}
                      </Text>
                    );
                  }

                  return (
                    <View key={index} style={[styles.diffLine, isAddedLine && styles.addedLine, isRemovedLine && styles.removedLine]}>
                      <Text style={[styles.terminalOutputLine, isAddedLine && { color: '#3FB950' }, isRemovedLine && { color: '#F85149' }]}>
                        {line}
                      </Text>
                    </View>
                  );
                })}

                {!isExpanded && diffLines.length > 6 && (
                  <View style={styles.expandOverlay}>
                    <LinearGradient colors={['transparent', 'rgba(20, 20, 20, 0.95)']} style={styles.gradientOverlay} />
                    <TouchableOpacity onPress={() => setIsExpanded(true)} style={styles.showMoreButton}>
                      <Text style={styles.showMoreText}>Show {diffLines.length - 6} more lines</Text>
                      <Ionicons name="chevron-down" size={14} color="#8B949E" />
                    </TouchableOpacity>
                  </View>
                )}

                {isExpanded && diffLines.length > 6 && (
                  <TouchableOpacity onPress={() => setIsExpanded(false)} style={styles.showLessButton}>
                    <Text style={styles.showMoreText}>{t('common:showLess')}</Text>
                    <Ionicons name="chevron-up" size={14} color="#8B949E" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </View>
      );
    })()
  ) : (item.content || '').startsWith('List files') ? (
    (() => {
      const content = item.content || '';
      const lines = content.split('\n');
      const fullHeader = lines[0];
      const directory = fullHeader.replace('List files in ', '');
      const stats = lines[1];
      const lsLines = lines.slice(3).filter((line) => line.trim() && !line.startsWith('total') && !line.startsWith('Contents of'));
      const files = lsLines.map((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('[DIR]')) {
          return { name: trimmed.replace('[DIR]', '').trim(), isDir: true };
        }
        if (trimmed.startsWith('[FILE]')) {
          return { name: trimmed.replace('[FILE]', '').trim(), isDir: false };
        }
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 9) {
          const permissions = parts[0];
          const isDir = permissions.startsWith('d');
          const name = parts.slice(8).join(' ');
          if (name === '.' || name === '..') return null;
          return { name, isDir };
        }
        if (trimmed && !trimmed.includes(':')) {
          return { name: trimmed, isDir: trimmed.endsWith('/') };
        }
        return null;
      }).filter(Boolean) as { name: string; isDir: boolean }[];

      return (
        <View>
          <View style={styles.readFileInline}>
            <View style={[styles.toolBadge, styles.toolBadgeList]}>
              <Ionicons name="folder-open-outline" size={12} color="#A371F7" />
              <Text style={[styles.toolBadgeText, { color: '#A371F7' }]}>{t('terminal:terminalItem.badges.list')}</Text>
            </View>
            <Text style={styles.readFileName}>{directory}</Text>
            <Text style={[styles.readFileName, { color: 'rgba(255,255,255,0.5)', marginLeft: 8 }]}>
              {stats.replace('└─ ', '')}
            </Text>
          </View>

          <View style={styles.fileListCard}>
            {files.slice(0, isExpanded ? undefined : 10).map((file, index) => (
              <View key={index} style={styles.fileListItem}>
                <Ionicons
                  name={file.isDir ? 'folder' : 'document-text-outline'}
                  size={14}
                  color={file.isDir ? '#58A6FF' : '#8B949E'}
                />
                <Text style={[styles.fileListName, file.isDir && styles.fileListNameDir]}>
                  {file.name}
                </Text>
              </View>
            ))}

            {!isExpanded && files.length > 10 && (
              <TouchableOpacity onPress={() => setIsExpanded(true)} style={styles.showMoreButton}>
                <Text style={styles.showMoreText}>Show {files.length - 10} more files</Text>
                <Ionicons name="chevron-down" size={14} color="#8B949E" />
              </TouchableOpacity>
            )}

            {isExpanded && files.length > 10 && (
              <TouchableOpacity onPress={() => setIsExpanded(false)} style={styles.showLessButton}>
                <Text style={styles.showMoreText}>{t('common:showLess')}</Text>
                <Ionicons name="chevron-up" size={14} color="#8B949E" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    })()
  ) : (item.content || '').startsWith('Todo List') ? (
    (() => {
      const content = item.content || '';
      const lines = content.split('\n');
      const todoLines = lines.slice(3).filter((line) => line.trim() && line.includes('|'));
      const todos = todoLines.map((line) => {
        const [status, ...contentParts] = line.split('|');
        return {
          status: status.trim(),
          content: contentParts.join('|').trim(),
        };
      });

      return (
        <View style={styles.todoBoard}>
          <View style={styles.todoBoardHeader}>
            <View style={[styles.toolBadge, styles.toolBadgeTodo]}>
              <Ionicons name="checkmark-done-outline" size={12} color="#FFB86C" />
              <Text style={[styles.toolBadgeText, { color: '#FFB86C' }]}>{t('terminal:terminalItem.badges.todo')}</Text>
            </View>
            <View style={styles.todoBoardTitleWrap}>
              <Text style={styles.todoBoardTitle}>{t('terminal:terminalItem.activityTitle')}</Text>
            </View>
          </View>

          <View style={styles.todoListCard}>
            {todos.map((todo, index) => {
              const isPending = todo.status === 'pending';
              const isInProgress = todo.status === 'in_progress';
              const isCompleted = todo.status === 'completed';

              let icon = 'ellipse-outline';
              let iconColor = '#6E7681';
              if (isInProgress) {
                icon = 'sync-outline';
                iconColor = '#58A6FF';
              } else if (isCompleted) {
                icon = 'checkmark-circle';
                iconColor = '#3FB950';
              }

              return (
                <View
                  key={index}
                  style={[
                    styles.todoItem,
                    isPending && styles.todoItemPending,
                    isInProgress && styles.todoItemInProgress,
                    isCompleted && styles.todoItemCompletedRow,
                  ]}
                >
                  <View style={styles.todoItemIconMinimal}>
                    <Ionicons name={icon as any} size={15} color={iconColor} />
                  </View>
                  <Text style={[styles.todoContent, isCompleted && styles.todoContentCompleted]}>
                    {todo.content}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      );
    })()
  ) : ((item.content || '').startsWith('Search "') || (item.content || '').startsWith('grep_search')) ? (
    (() => {
      const content = item.content || '';
      const contentLines = content.split('\n');
      const fullHeader = contentLines[0];
      const queryMatch = fullHeader.match(/Search "(.+)"/);
      const query = queryMatch ? queryMatch[1] : fullHeader.replace('grep_search', '').trim() || 'pattern';
      const stats = contentLines[1];
      const matchLines = contentLines.slice(3).filter((line) => line.trim());

      return (
        <View>
          <View style={styles.readFileInline}>
            <View style={[styles.toolBadge, styles.toolBadgeSearch]}>
              <Ionicons name="search-outline" size={12} color="#FFA657" />
              <Text style={[styles.toolBadgeText, { color: '#FFA657' }]}>GREP</Text>
            </View>
            <Text style={styles.readFileName} numberOfLines={1}>{query}</Text>
            {stats && (
              <Text style={[styles.readFileName, { color: 'rgba(255,255,255,0.5)', marginLeft: 8 }]}>
                {stats.replace('└─ ', '')}
              </Text>
            )}
          </View>

          {matchLines.length > 0 && (
            <View style={styles.fileListCard}>
              {matchLines.slice(0, isExpanded ? undefined : 8).map((line, index) => {
                const colonIdx = line.indexOf(':');
                const file = colonIdx > 0 ? line.substring(0, colonIdx).replace(/^\/home\/coder\/project\/?/, '') : '';
                const rest = colonIdx > 0 ? line.substring(colonIdx + 1) : line;

                return (
                  <View key={index} style={styles.fileListItem}>
                    <Ionicons name="code-slash-outline" size={13} color="#FFA657" />
                    <Text style={[styles.fileListName, { color: '#FFA657' }]} numberOfLines={1}>
                      {file}
                    </Text>
                    <Text style={[styles.fileListName, { color: '#8B949E', flex: 1 }]} numberOfLines={1}>
                      {rest}
                    </Text>
                  </View>
                );
              })}

              {!isExpanded && matchLines.length > 8 && (
                <TouchableOpacity onPress={() => setIsExpanded(true)} style={styles.showMoreButton}>
                  <Text style={styles.showMoreText}>Show {matchLines.length - 8} more matches</Text>
                  <Ionicons name="chevron-down" size={14} color="#8B949E" />
                </TouchableOpacity>
              )}

              {isExpanded && matchLines.length > 8 && (
                <TouchableOpacity onPress={() => setIsExpanded(false)} style={styles.showLessButton}>
                  <Text style={styles.showMoreText}>{t('common:showLess')}</Text>
                  <Ionicons name="chevron-up" size={14} color="#8B949E" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      );
    })()
  ) : ((item.content || '').startsWith('Fetch:') || (item.content || '').startsWith('Fetch URL') || (item.content || '').startsWith('web_fetch')) ? (
    (() => {
      const content = item.content || '';
      const contentLines = content.split('\n');
      const fullHeader = contentLines[0];
      const urlMatch = fullHeader.match(/(?:Fetch:?\s*(?:URL\s*)?|web_fetch\s*)(.*)/);
      const url = (urlMatch && urlMatch[1].trim()) || 'URL';
      const displayUrl = url.length > 50 ? `${url.substring(0, 50)}...` : url;
      const stats = contentLines[1];

      return (
        <View>
          <View style={styles.readFileInline}>
            <View style={[styles.toolBadge, { backgroundColor: 'rgba(88, 166, 255, 0.15)', borderColor: 'rgba(88, 166, 255, 0.3)' }]}>
              <Ionicons name="cloud-download-outline" size={12} color="#58A6FF" />
              <Text style={[styles.toolBadgeText, { color: '#58A6FF' }]}>FETCH</Text>
            </View>
            <Text style={styles.readFileName} numberOfLines={1}>{displayUrl}</Text>
          </View>
          {stats && <Text style={styles.globStats}>{stats}</Text>}
        </View>
      );
    })()
  ) : ((item.content || '').startsWith('Diagnostics') || (item.content || '').startsWith('LSP:')) ? (
    (() => {
      const content = item.content || '';
      const contentLines = content.split('\n');
      const fullHeader = contentLines[0];
      const stats = contentLines[1];
      const isDiag = fullHeader.startsWith('Diagnostics');
      const label = isDiag ? fullHeader.replace('Diagnostics ', '').trim() || 'project' : fullHeader.replace('LSP: ', '').trim();
      const detailLines = contentLines.slice(3).filter((line) => line.trim());

      return (
        <View>
          <View style={styles.readFileInline}>
            <View style={[styles.toolBadge, { backgroundColor: 'rgba(255, 166, 87, 0.15)', borderColor: 'rgba(255, 166, 87, 0.3)' }]}>
              <Ionicons name={isDiag ? 'warning-outline' : 'code-outline'} size={12} color="#FFA657" />
              <Text style={[styles.toolBadgeText, { color: '#FFA657' }]}>{isDiag ? 'DIAG' : 'LSP'}</Text>
            </View>
            <Text style={styles.readFileName} numberOfLines={1}>{label}</Text>
            {stats && (
              <Text style={[styles.readFileName, { color: 'rgba(255,255,255,0.5)', marginLeft: 8 }]}>
                {stats.replace('└─ ', '')}
              </Text>
            )}
          </View>

          {detailLines.length > 0 && (
            <View style={styles.fileListCard}>
              {detailLines.slice(0, isExpanded ? undefined : 6).map((line, index) => (
                <View key={index} style={styles.fileListItem}>
                  <Ionicons
                    name={line.toLowerCase().includes('error') ? 'close-circle-outline' : 'alert-circle-outline'}
                    size={13}
                    color={line.toLowerCase().includes('error') ? '#F85149' : '#FFA657'}
                  />
                  <Text style={[styles.fileListName, { color: '#C9D1D9' }]} numberOfLines={2}>
                    {line.replace(/^\/home\/coder\/project\/?/, '')}
                  </Text>
                </View>
              ))}

              {!isExpanded && detailLines.length > 6 && (
                <TouchableOpacity onPress={() => setIsExpanded(true)} style={styles.showMoreButton}>
                  <Text style={styles.showMoreText}>Show {detailLines.length - 6} more</Text>
                  <Ionicons name="chevron-down" size={14} color="#8B949E" />
                </TouchableOpacity>
              )}
              {isExpanded && detailLines.length > 6 && (
                <TouchableOpacity onPress={() => setIsExpanded(false)} style={styles.showLessButton}>
                  <Text style={styles.showMoreText}>{t('common:showLess')}</Text>
                  <Ionicons name="chevron-up" size={14} color="#8B949E" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      );
    })()
  ) : (item.content || '').startsWith('Web Search') ? (
    (() => {
      const content = item.content || '';
      const lines = content.split('\n');
      const fullHeader = lines[0];
      const stats = lines[1];
      const queryMatch = fullHeader.match(/Web Search "(.+)"/);
      const query = queryMatch ? queryMatch[1] : 'Unknown query';
      const resultLines = lines.slice(3).filter((line) => line.trim() && line.includes('|'));
      const results = resultLines.map((line) => {
        const [title, url, snippet] = line.split('|');
        return { title, url, snippet };
      });

      return (
        <View>
          <View style={styles.readFileInline}>
            <View style={[styles.toolBadge, styles.toolBadgeWebSearch]}>
              <Ionicons name="globe-outline" size={12} color="#58A6FF" />
              <Text style={[styles.toolBadgeText, { color: '#58A6FF' }]}>{t('terminal:terminalItem.badges.web')}</Text>
            </View>
            <Text style={styles.readFileName}>{query}</Text>
          </View>

          {stats && <Text style={styles.webSearchStats}>{stats.replace('└─ ', '')}</Text>}

          {results.length > 0 && (
            <View style={styles.webSearchResults}>
              {results.slice(0, isExpanded ? undefined : 3).map((result, index) => (
                <View key={index} style={styles.webSearchResultItem}>
                  <View style={styles.webSearchResultHeader}>
                    <Ionicons name="link-outline" size={14} color="#58A6FF" />
                    <Text style={styles.webSearchResultTitle} numberOfLines={1}>
                      {result.title}
                    </Text>
                  </View>
                  {result.url && <Text style={styles.webSearchResultUrl} numberOfLines={1}>{result.url}</Text>}
                  {result.snippet && <Text style={styles.webSearchResultSnippet} numberOfLines={2}>{result.snippet}</Text>}
                </View>
              ))}

              {!isExpanded && results.length > 3 && (
                <TouchableOpacity onPress={() => setIsExpanded(true)} style={styles.showMoreButton}>
                  <Text style={styles.showMoreText}>Show {results.length - 3} more results</Text>
                  <Ionicons name="chevron-down" size={14} color="#8B949E" />
                </TouchableOpacity>
              )}

              {isExpanded && results.length > 3 && (
                <TouchableOpacity onPress={() => setIsExpanded(false)} style={styles.showLessButton}>
                  <Text style={styles.showMoreText}>{t('common:showLess')}</Text>
                  <Ionicons name="chevron-up" size={14} color="#8B949E" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      );
    })()
  ) : (item.content || '').startsWith('User Question') ? (
    (() => {
      const content = item.content || '';
      const lines = content.split('\n');
      const stats = lines[1];
      const qaLines = lines.slice(3).filter((line) => line.trim() && line.includes('|'));
      const qas = qaLines.map((line) => {
        const [question, answer] = line.split('|');
        return { question, answer };
      });

      return (
        <View>
          <View style={styles.readFileInline}>
            <View style={[styles.toolBadge, styles.toolBadgeQuestion]}>
              <Ionicons name="help-circle-outline" size={12} color="#FFA657" />
              <Text style={[styles.toolBadgeText, { color: '#FFA657' }]}>{t('terminal:terminalItem.badges.qa')}</Text>
            </View>
            <Text style={[styles.readFileName, { color: 'rgba(255,255,255,0.5)' }]}>
              {stats ? stats.replace('└─ ', '') : 'User input'}
            </Text>
          </View>

          {qas.length > 0 && (
            <View style={styles.qaList}>
              {qas.map((qa, index) => (
                <View key={index} style={styles.qaItem}>
                  <View style={styles.qaQuestion}>
                    <Ionicons name="chatbubble-ellipses-outline" size={14} color="#FFA657" />
                    <Text style={styles.qaQuestionText}>{qa.question}</Text>
                  </View>
                  <View style={styles.qaAnswer}>
                    <Ionicons name="arrow-forward" size={12} color="#6E7681" />
                    <Text style={styles.qaAnswerText}>{qa.answer}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      );
    })()
  ) : (item.content || '').startsWith('Execute:') && !(item.content || '').startsWith('Execute: curl') ? (
    (() => {
      const content = item.content || '';
      const lines = content.split('\n');
      const executeHeader = lines[0];
      const statusLine = lines[1];
      const commandMatch = executeHeader.match(/Execute: (.+)/);
      const command = commandMatch ? commandMatch[1] : 'Unknown command';
      const displayCommand = command.length > 60 ? `${command.substring(0, 60)}...` : command;
      const isError = statusLine && (statusLine.includes('Error') || statusLine.includes('exit'));
      const status = statusLine ? statusLine.replace('└─ ', '') : 'Command completed';
      const outputLines = lines.slice(2).filter((line) => line.trim());
      const hasOutput = outputLines.length > 0;
      const shouldCollapse = outputLines.length > 5;

      return (
        <View>
          <View style={styles.readFileInline}>
            <View style={[styles.toolBadge, { backgroundColor: 'rgba(46, 160, 67, 0.1)', borderColor: 'rgba(46, 160, 67, 0.2)' }]}>
              <Ionicons name="terminal" size={12} color="#3FB950" />
              <Text style={[styles.toolBadgeText, { color: '#3FB950' }]}>{t('terminal:terminalItem.badges.command')}</Text>
            </View>
            <Text style={styles.readFileName} numberOfLines={1}>{displayCommand}</Text>
          </View>

          <Text style={[styles.curlStatus, isError && { color: '#F85149' }]}>{status}</Text>

          {hasOutput && (
            <View style={styles.curlOutput}>
              <Text style={styles.curlOutputText}>
                {(isExpanded ? outputLines : outputLines.slice(0, 5)).join('\n')}
              </Text>

              {!isExpanded && shouldCollapse && (
                <TouchableOpacity onPress={() => setIsExpanded(true)} style={[styles.showMoreButton, { marginTop: 12 }]}>
                  <Text style={styles.showMoreText}>{t('terminal:terminalItem.showMoreLines', { count: outputLines.length - 5 })}</Text>
                  <Ionicons name="chevron-down" size={14} color="#8B949E" />
                </TouchableOpacity>
              )}

              {isExpanded && shouldCollapse && (
                <TouchableOpacity onPress={() => setIsExpanded(false)} style={styles.showLessButton}>
                  <Text style={styles.showMoreText}>{t('common:showLess')}</Text>
                  <Ionicons name="chevron-up" size={14} color="#8B949E" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      );
    })()
  ) : (item.content || '').startsWith('Execute: curl') ? (
    (() => {
      const content = item.content || '';
      const lines = content.split('\n');
      const executeHeader = lines[0];
      const statusLine = lines[1];
      const urlMatch = executeHeader.match(/Execute: curl (.+)/);
      const url = urlMatch ? urlMatch[1] : 'Unknown URL';
      const isError = statusLine && statusLine.includes('Error');
      const status = statusLine ? statusLine.replace('└─ ', '') : 'Completed';
      const outputLines = lines.slice(2).filter((line) => line.trim());
      const hasOutput = outputLines.length > 0;
      const shouldCollapse = outputLines.length > 4;

      return (
        <View>
          <View style={styles.readFileInline}>
            <View style={[styles.toolBadge, styles.toolBadgeCurl]}>
              <Ionicons name="terminal-outline" size={12} color="#A371F7" />
              <Text style={[styles.toolBadgeText, { color: '#A371F7' }]}>CURL</Text>
            </View>
            <Text style={styles.readFileName} numberOfLines={1}>{url}</Text>
          </View>

          <Text style={[styles.curlStatus, isError && { color: '#F85149' }]}>{status}</Text>

          {hasOutput && (
            <View style={styles.curlOutput}>
              <Text style={styles.curlOutputText}>
                {(isExpanded ? outputLines : outputLines.slice(0, 4)).join('\n')}
              </Text>

              {!isExpanded && shouldCollapse && (
                <TouchableOpacity onPress={() => setIsExpanded(true)} style={[styles.showMoreButton, { marginTop: 12 }]}>
                  <Text style={styles.showMoreText}>{t('terminal:terminalItem.showMoreLines', { count: outputLines.length - 4 })}</Text>
                  <Ionicons name="chevron-down" size={14} color="#8B949E" />
                </TouchableOpacity>
              )}

              {isExpanded && shouldCollapse && (
                <TouchableOpacity onPress={() => setIsExpanded(false)} style={styles.showLessButton}>
                  <Text style={styles.showMoreText}>{t('common:showLess')}</Text>
                  <Ionicons name="chevron-up" size={14} color="#8B949E" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      );
    })()
  ) : (item.content || '').startsWith('Agent:') ? (
    (() => {
      const content = item.content || '';
      const lines = content.split('\n');
      const agentHeader = lines[0];
      const statusLine = lines[1];
      const typeMatch = agentHeader.match(/Agent:\s*(.+)/);
      const agentType = typeMatch ? typeMatch[1] : 'agent';
      const restContent = lines.slice(3).join('\n').trim();
      const parts = restContent.split('\n\n');
      const description = parts[0] || '';
      const summary = parts.slice(1).join('\n\n') || '';
      const isError = statusLine && statusLine.includes('Error');
      const errorMsg = isError ? statusLine.replace('└─ Error: ', '') : '';
      const agentIcon = agentType === 'explore' ? 'search' : agentType === 'plan' ? 'document-text' : 'flash';
      const agentLabel = agentType === 'explore' ? 'Explore' : agentType === 'plan' ? 'Plan' : agentType === 'general' ? 'General' : agentType;

      return (
        <View style={styles.agentCard}>
          <View style={styles.agentCardHeader}>
            <View style={styles.agentCardLeft}>
              <View style={[styles.toolBadge, styles.toolBadgeAgent]}>
                <Ionicons name={agentIcon as any} size={12} color="#BC8CFF" />
                <Text style={[styles.toolBadgeText, { color: '#BC8CFF' }]}>{t('terminal:terminalItem.badges.agent')}</Text>
              </View>
              <Text style={styles.agentTypeName}>{agentLabel}</Text>
            </View>
            <View style={[styles.agentStatusChip, isError && styles.agentStatusChipError]}>
              <Ionicons name={isError ? 'close-circle' : 'checkmark-circle'} size={12} color={isError ? '#F85149' : '#3FB950'} />
              <Text style={[styles.agentStatusChipText, isError && { color: '#F85149' }]}>
                {isError ? t('common:error') : t('common:done')}
              </Text>
            </View>
          </View>

          {isError && errorMsg ? <Text style={styles.agentErrorText}>{errorMsg}</Text> : null}
          {description ? <Text style={styles.agentCardDescription} numberOfLines={2}>{description}</Text> : null}

          {summary ? (
            <>
              <View style={styles.agentDivider} />
              <Text style={styles.agentResultText} numberOfLines={isExpanded ? undefined : 4}>{summary}</Text>
              {summary.split('\n').length > 4 && (
                <TouchableOpacity onPress={() => setIsExpanded(!isExpanded)} style={styles.agentExpandBtn}>
                  <Text style={styles.agentExpandText}>{isExpanded ? t('common:showLess') : t('common:showMore')}</Text>
                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="#6E7681" />
                </TouchableOpacity>
              )}
            </>
          ) : null}
        </View>
      );
    })()
  ) : isTerminalCommandItem(item) ? (
    (() => {
      const content = item.content || '';
      const lines = content.split('\n');
      const maxLines = 50;
      const shouldTruncate = lines.length > maxLines;
      const displayLines = isExpanded ? lines : lines.slice(0, maxLines);
      const displayContent = displayLines.join('\n');

      return (
        <View>
          <Text style={styles.terminalOutput}>{displayContent}</Text>
          {shouldTruncate && !isExpanded && (
            <TouchableOpacity onPress={() => setIsExpanded(true)} style={styles.showMoreButtonSimple}>
              <Text style={styles.showMoreText}>{t('terminal:terminalItem.showMoreLines', { count: lines.length - maxLines })}</Text>
              <Ionicons name="chevron-down" size={14} color="#8B949E" />
            </TouchableOpacity>
          )}
          {shouldTruncate && isExpanded && (
            <TouchableOpacity onPress={() => setIsExpanded(false)} style={styles.showMoreButtonSimple}>
              <Text style={styles.showMoreText}>{t('common:showLess')}</Text>
              <Ionicons name="chevron-up" size={14} color="#8B949E" />
            </TouchableOpacity>
          )}
        </View>
      );
    })()
  ) : (
    <View style={styles.assistantMessageContent}>
      {showThinking && !item.content ? (
        <View style={[styles.thinkingStreamContainer, styles.thinkingStreamRow]}>
          <Animated.Text style={[styles.thinkingShimmerText, { opacity: thinkingPulseOpacity }]}>
            {thinkingDisplayText}
          </Animated.Text>
          <View style={styles.thinkingDotsRow}>
            <Animated.Text style={[styles.thinkingDotsText, { opacity: thinkingDotOpacity1 }]}>.</Animated.Text>
            <Animated.Text style={[styles.thinkingDotsText, { opacity: thinkingDotOpacity2 }]}>.</Animated.Text>
            <Animated.Text style={[styles.thinkingDotsText, { opacity: thinkingDotOpacity3 }]}>.</Animated.Text>
          </View>
        </View>
      ) : (
        <TouchableOpacity activeOpacity={0.9} onLongPress={() => void handleCopy(item.content || '')} delayLongPress={300}>
          <View>
            <>
              {item.thinkingContent && (
                <Text style={styles.thinkingStreamText}>{item.thinkingContent}</Text>
              )}
              <View style={{ overflow: 'hidden', flex: 1 }}>
                <Markdown style={markdownStyles as any} rules={markdownRules as any}>{item.content || ''}</Markdown>
              </View>
              <View style={styles.costIndicator}>
                {item.tokensUsed ? (
                  <View style={styles.tokenBadge}>
                    <Ionicons name="sparkles-outline" size={10} color="rgba(255, 255, 255, 0.45)" />
                    <Text style={styles.costText}>
                      {((item.tokensUsed.input + item.tokensUsed.output) / 1000).toFixed(1)}k tokens
                    </Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  onPress={() => void handleCopy(item.content || '')}
                  activeOpacity={0.6}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  style={styles.outputCopyButton}
                >
                  <Ionicons
                    name={copiedFeedback ? 'checkmark' : 'copy-outline'}
                    size={12}
                    color={copiedFeedback ? '#3FB950' : 'rgba(255,255,255,0.3)'}
                  />
                </TouchableOpacity>
              </View>
            </>
          </View>
        </TouchableOpacity>
      )}
    </View>
  )
);
