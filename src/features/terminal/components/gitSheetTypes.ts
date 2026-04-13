/**
 * Shared prop types for GitSheet sub-components.
 * Derived from the return types of useGitSheetData and useGitSheetActions.
 */
import type { StyleSheet } from 'react-native';
import type { useGitSheetData } from './hooks/useGitSheetData';
import type { useGitSheetActions } from './hooks/useGitSheetActions';

/** The full return value of useGitSheetData */
export type GitSheetData = ReturnType<typeof useGitSheetData>;

/** The full return value of useGitSheetActions */
export type GitSheetActions = ReturnType<typeof useGitSheetActions>;

/** StyleSheet created in GitSheet.tsx — opaque to sub-components */
export type GitSheetStyles = ReturnType<typeof StyleSheet.create>;
