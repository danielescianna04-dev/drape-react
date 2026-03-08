import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase/firebase';

/**
 * Lightweight analytics service — writes events to Firestore `user_events` collection.
 * Events are aggregated server-side for the admin behavior dashboard.
 */

function trackEvent(type: string, data?: Record<string, string>) {
  const user = auth.currentUser;
  if (!user) return;
  addDoc(collection(db, 'user_events'), {
    type,
    ...data,
    userId: user.uid,
    email: user.email || '',
    timestamp: serverTimestamp(),
  }).catch(() => {});
}

// Screen navigation
export function trackScreenView(screen: string) {
  trackEvent('screen_view', { screen });
}

// Auth actions
export function trackLogin(method: string) {
  trackEvent('login', { method });
}

export function trackRegister() {
  trackEvent('register');
}

export function trackForgotPassword() {
  trackEvent('forgot_password');
}

export function trackLogout() {
  trackEvent('logout');
}

export function trackDeleteAccount() {
  trackEvent('delete_account');
}

// Project actions
export function trackProjectOpen(projectName: string) {
  trackEvent('project_open', { projectName });
}

export function trackProjectCreate(projectName: string, language: string, mode: string, description?: string) {
  trackEvent('project_create', { projectName, language, mode, ...(description ? { description: description.substring(0, 200) } : {}) });
}

export function trackProjectDelete(projectName: string) {
  trackEvent('project_delete', { projectName });
}

export function trackProjectRename(oldName: string, newName: string) {
  trackEvent('project_rename', { oldName, newName });
}

export function trackProjectDuplicate(projectName: string) {
  trackEvent('project_duplicate', { projectName });
}

export function trackProjectShare(projectName: string) {
  trackEvent('project_share', { projectName });
}

// Panel / tab actions
export function trackPanelOpen(panel: string) {
  trackEvent('panel_open', { panel });
}

export function trackTabOpen(tab: string) {
  trackEvent('tab_open', { tab });
}

export function trackTabSwitch(tabType: string) {
  trackEvent('tab_switch', { tabType });
}

export function trackTabClose(tabType: string) {
  trackEvent('tab_close', { tabType });
}

// Chat actions
export function trackChatMessage(model: string, agentMode: string) {
  trackEvent('chat_message', { model, agentMode });
}

export function trackChatTerminalCommand() {
  trackEvent('chat_terminal_command');
}

export function trackNewChat(chatType: string) {
  trackEvent('new_chat', { chatType });
}

export function trackChatMinimize(collapsed: string) {
  trackEvent('chat_minimize', { collapsed });
}

export function trackChatSelect(chatTitle: string) {
  trackEvent('chat_select', { chatTitle: chatTitle.substring(0, 100) });
}

export function trackChatDelete() {
  trackEvent('chat_delete');
}

export function trackChatRename(newTitle: string) {
  trackEvent('chat_rename', { newTitle: newTitle.substring(0, 100) });
}

export function trackChatPin(pinned: string) {
  trackEvent('chat_pin', { pinned });
}

export function trackChatMoveFolder() {
  trackEvent('chat_move_folder');
}

// Model selection
export function trackModelSelect(model: string) {
  trackEvent('model_select', { model });
}

// File operations
export function trackFileOpen(fileName: string) {
  trackEvent('file_open', { fileName });
}

export function trackFileCreate(fileName: string, fileType: string) {
  trackEvent('file_create', { fileName, fileType });
}

export function trackFileDelete(fileName: string) {
  trackEvent('file_delete', { fileName });
}

export function trackFileRename(oldName: string, newName: string) {
  trackEvent('file_rename', { oldName, newName });
}

// Preview actions
export function trackPreviewStart(projectName: string) {
  trackEvent('preview_start', { projectName });
}

export function trackPreviewReady(projectName: string) {
  trackEvent('preview_ready', { projectName });
}

export function trackPreviewRefresh() {
  trackEvent('preview_refresh');
}

export function trackPreviewStop() {
  trackEvent('preview_stop');
}

export function trackPreviewError(errorMessage: string) {
  trackEvent('preview_error', { errorMessage: errorMessage.substring(0, 200) });
}

export function trackPreviewFixWithAI() {
  trackEvent('preview_fix_ai');
}

// Publish actions
export function trackPublish(slug: string) {
  trackEvent('publish', { slug });
}

export function trackPublishSuccess(slug: string, url: string) {
  trackEvent('publish_success', { slug, url: url.substring(0, 200) });
}

export function trackPublishError(errorMessage: string) {
  trackEvent('publish_error', { errorMessage: errorMessage.substring(0, 200) });
}

export function trackPublishShare(slug: string) {
  trackEvent('publish_share', { slug });
}

export function trackPublishOpenUrl(slug: string) {
  trackEvent('publish_open_url', { slug });
}

export function trackUnpublish(slug: string) {
  trackEvent('unpublish', { slug });
}

// UI actions
export function trackGridButton() {
  trackEvent('grid_button');
}

export function trackChatOpenPreview() {
  trackEvent('chat_open_preview');
}

export function trackInspectMode(enabled: string) {
  trackEvent('inspect_mode', { enabled });
}

export function trackElementSelected(selector: string) {
  trackEvent('element_selected', { selector: selector.substring(0, 200) });
}

export function trackViewportChange(mode: string) {
  trackEvent('viewport_change', { mode });
}

export function trackGitImport() {
  trackEvent('git_import');
}

// Git operations
export function trackGitAction(action: string) {
  trackEvent('git_action', { action });
}

export function trackGitCommit() {
  trackEvent('git_commit');
}

export function trackGitCheckout(branch: string) {
  trackEvent('git_checkout', { branch: branch.substring(0, 100) });
}

export function trackGitAuth(provider: string) {
  trackEvent('git_auth', { provider });
}

export function trackGitAuthSuccess(provider: string) {
  trackEvent('git_auth_success', { provider });
}

export function trackGitAuthError(provider: string, errorMessage: string) {
  trackEvent('git_auth_error', { provider, errorMessage: errorMessage.substring(0, 200) });
}

export function trackGitAccountRemove(provider: string) {
  trackEvent('git_account_remove', { provider });
}

export function trackGitRepoConnect(repoUrl: string) {
  trackEvent('git_repo_connect', { repoUrl: repoUrl.substring(0, 200) });
}

export function trackGitRepoImport(repoName: string) {
  trackEvent('git_repo_import', { repoName: repoName.substring(0, 100) });
}

export function trackGitTabSwitch(tab: string) {
  trackEvent('git_tab_switch', { tab });
}

export function trackGitBranchCreate(branch: string) {
  trackEvent('git_branch_create', { branch: branch.substring(0, 100) });
}

export function trackGitCommitView() {
  trackEvent('git_commit_view');
}

export function trackGitSelectAll() {
  trackEvent('git_select_all');
}

export function trackGitLinkAccount(provider: string) {
  trackEvent('git_link_account', { provider });
}

export function trackGitUnlinkAccount(provider: string) {
  trackEvent('git_unlink_account', { provider });
}

export function trackGitConnectRepo() {
  trackEvent('git_connect_repo');
}

export function trackGitPush() {
  trackEvent('git_push');
}

// Env vars
export function trackEnvVarAdd(key: string) {
  trackEvent('env_var_add', { key: key.substring(0, 50) });
}

export function trackEnvVarDelete(key: string) {
  trackEvent('env_var_delete', { key: key.substring(0, 50) });
}

// Settings
export function trackLanguageChange(language: string) {
  trackEvent('language_change', { language });
}

export function trackPasswordChange() {
  trackEvent('password_change');
}

export function trackPasswordChangeError(errorMessage: string) {
  trackEvent('password_change_error', { errorMessage: errorMessage.substring(0, 200) });
}

export function trackEmailChange() {
  trackEvent('email_change');
}

export function trackEmailChangeError(errorMessage: string) {
  trackEvent('email_change_error', { errorMessage: errorMessage.substring(0, 200) });
}

export function trackNameChange() {
  trackEvent('name_change');
}

export function trackRestorePurchases() {
  trackEvent('restore_purchases');
}

// Plan & IAP
export function trackPlanSelect(plan: string) {
  trackEvent('plan_select', { plan });
}

export function trackPurchaseStart(productId: string) {
  trackEvent('purchase_start', { productId });
}

export function trackPurchaseSuccess(productId: string, plan: string) {
  trackEvent('purchase_success', { productId, plan });
}

export function trackPurchaseError(productId: string, errorType: string) {
  trackEvent('purchase_error', { productId, errorType });
}

// Project filter
export function trackProjectFilter(filter: string) {
  trackEvent('project_filter', { filter });
}

export function trackProjectBulkDelete(count: string) {
  trackEvent('project_bulk_delete', { count });
}

// Plans UI
export function trackPlansView(source: string) {
  trackEvent('plans_view', { source });
}

export function trackPlansClose() {
  trackEvent('plans_close');
}

export function trackBillingCycleChange(cycle: string) {
  trackEvent('billing_cycle_change', { cycle });
}

export function trackLegalView(legalType: string) {
  trackEvent('legal_view', { legalType });
}

export function trackNotificationToggle(type: string, enabled: string) {
  trackEvent('notification_toggle', { notificationType: type, enabled });
}

// Errors
export function trackError(errorMessage: string, context: string) {
  trackEvent('error', { errorMessage: errorMessage.substring(0, 200), context });
}
