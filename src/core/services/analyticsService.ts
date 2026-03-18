import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Platform, Dimensions } from 'react-native';
import { db, auth } from '../firebase/firebase';
import { isConsentGranted } from './consentService';

/**
 * Servizio analytics — scrive eventi nella collezione Firestore `user_events`.
 * Gli eventi vengono aggregati lato server per la dashboard admin.
 *
 * GDPR: ogni chiamata di tracking controlla il consenso analytics prima di scrivere.
 * L'email non è mai inclusa — solo userId pseudonimizzato.
 */

const getDeviceType = (): string => {
  const { width, height } = Dimensions.get('window');
  const minDim = Math.min(width, height);
  return minDim >= 600 ? 'tablet' : 'phone';
};

function trackEvent(type: string, data?: Record<string, string>) {
  // GDPR: skip tracking if user has not given analytics consent
  if (!isConsentGranted('analytics')) return;

  const user = auth.currentUser;
  if (!user) return;
  addDoc(collection(db, 'user_events'), {
    type,
    ...data,
    userId: user.uid,
    platform: Platform.OS,
    deviceType: getDeviceType(),
    timestamp: serverTimestamp(),
  }).catch(() => {});
}

// ── Autenticazione ──────────────────────────────────

export function tracciaLogin(metodo: string) {
  trackEvent('login', { metodo });
}

export function tracciaRegistrazione() {
  trackEvent('registrazione');
}

export function tracciaResetPassword() {
  trackEvent('reset_password');
}

export function tracciaLogout() {
  trackEvent('logout');
}

export async function tracciaEliminaAccount() {
  // GDPR: skip tracking if user has not given analytics consent
  if (!isConsentGranted('analytics')) return;

  const user = auth.currentUser;
  if (!user) return;
  await addDoc(collection(db, 'user_events'), {
    type: 'elimina_account',
    userId: user.uid,
    platform: Platform.OS,
    deviceType: getDeviceType(),
    timestamp: serverTimestamp(),
  });
}

export function tracciaErrore(messaggio: string, contesto: string) {
  trackEvent('errore_app', { messaggio: messaggio.substring(0, 200), contesto });
}

// ── Navigazione ─────────────────────────────────────

export function tracciaSchermata(schermata: string) {
  trackEvent('schermata', { schermata });
}

// ── Progetti ────────────────────────────────────────

export function tracciaProgettoCreato(nome: string, linguaggio: string, modalita: string, descrizione?: string) {
  trackEvent('progetto_creato', { nome, linguaggio, modalita, ...(descrizione ? { descrizione: descrizione.substring(0, 200) } : {}) });
}

export function tracciaProgettoAperto(nome: string) {
  trackEvent('progetto_aperto', { nome });
}

export function tracciaProgettoEliminato(nome: string) {
  trackEvent('progetto_eliminato', { nome });
}

export function tracciaProgettoRinominato(vecchio_nome: string, nuovo_nome: string) {
  trackEvent('progetto_rinominato', { vecchio_nome, nuovo_nome });
}

export function tracciaProgettoDuplicato(nome: string) {
  trackEvent('progetto_duplicato', { nome });
}

export function tracciaProgettoCondiviso(nome: string) {
  trackEvent('progetto_condiviso', { nome });
}

export function tracciaProgettoFiltro(filtro: string) {
  trackEvent('progetto_filtro', { filtro });
}

export function tracciaProgettoEliminaMultipli(quantita: string) {
  trackEvent('progetto_elimina_multipli', { quantita });
}

// ── Chat & AI ───────────────────────────────────────

export function tracciaMessaggioChat(modello: string, modalita_agente: string) {
  trackEvent('messaggio_chat', { modello, modalita_agente });
}

export function tracciaComandoTerminaleChat() {
  trackEvent('comando_terminale_chat');
}

export function tracciaNuovaChat(tipo: string) {
  trackEvent('nuova_chat', { tipo });
}

export function tracciaChatMinimizzata(compressa: string) {
  trackEvent('chat_minimizzata', { compressa });
}

export function tracciaChatSelezionata(titolo: string) {
  trackEvent('chat_selezionata', { titolo: titolo.substring(0, 100) });
}

export function tracciaChatEliminata() {
  trackEvent('chat_eliminata');
}

export function tracciaChatRinominata(nuovo_titolo: string) {
  trackEvent('chat_rinominata', { nuovo_titolo: nuovo_titolo.substring(0, 100) });
}

export function tracciaChatFissata(fissata: string) {
  trackEvent('chat_fissata', { fissata });
}

export function tracciaChatSpostataCartella() {
  trackEvent('chat_spostata_cartella');
}

export function tracciaAnteprimaDaChat() {
  trackEvent('anteprima_da_chat');
}

export function tracciaChatBenvenutoChiuso() {
  trackEvent('chat_benvenuto_chiuso');
}

export function tracciaModelloSelezionato(modello: string) {
  trackEvent('modello_selezionato', { modello });
}

// ── Editor / Pannelli / Tab ─────────────────────────

export function tracciaPannelloAperto(pannello: string) {
  trackEvent('pannello_aperto', { pannello });
}

export function tracciaPannelloChiuso(pannello: string) {
  trackEvent('pannello_chiuso', { pannello });
}

export function tracciaTabAperto(tab: string) {
  trackEvent('tab_aperto', { tab });
}

export function tracciaTabCambiato(tipo_tab: string) {
  trackEvent('tab_cambiato', { tipo_tab });
}

export function tracciaTabChiuso(tipo_tab: string) {
  trackEvent('tab_chiuso', { tipo_tab });
}

export function tracciaFileAperto(nome_file: string) {
  trackEvent('file_aperto', { nome_file });
}

export function tracciaFileCreato(nome_file: string, tipo_file: string) {
  trackEvent('file_creato', { nome_file, tipo_file });
}

export function tracciaFileEliminato(nome_file: string) {
  trackEvent('file_eliminato', { nome_file });
}

export function tracciaFileRinominato(vecchio_nome: string, nuovo_nome: string) {
  trackEvent('file_rinominato', { vecchio_nome, nuovo_nome });
}

export function tracciaRicercaFile(query: string, modalita: string) {
  trackEvent('ricerca_file', { query: query.substring(0, 100), modalita });
}

export function tracciaEsploraFile() {
  trackEvent('esplora_file');
}

export function tracciaLayoutGriglia() {
  trackEvent('layout_griglia');
}

export function tracciaModalitaIspettore(attivo: string) {
  trackEvent('modalita_ispettore', { attivo });
}

export function tracciaElementoSelezionato(selettore: string) {
  trackEvent('elemento_selezionato', { selettore: selettore.substring(0, 200) });
}

export function tracciaCambioViewport(modalita: string) {
  trackEvent('cambio_viewport', { modalita });
}

// ── Anteprima ───────────────────────────────────────

export function tracciaAnteprimaAvviata(nome_progetto: string) {
  trackEvent('anteprima_avviata', { nome_progetto });
}

export function tracciaAnteprimaPronta(nome_progetto: string) {
  trackEvent('anteprima_pronta', { nome_progetto });
}

export function tracciaAnteprimaAggiornata() {
  trackEvent('anteprima_aggiornata');
}

export function tracciaAnteprimaFermata() {
  trackEvent('anteprima_fermata');
}

export function tracciaErroreAnteprima(messaggio_errore: string) {
  trackEvent('errore_anteprima', { messaggio_errore: messaggio_errore.substring(0, 200) });
}

export function tracciaFixAIAnteprima() {
  trackEvent('fix_ai_anteprima');
}

// ── Pubblicazione ───────────────────────────────────

export function tracciaPubblicazioneAvviata(slug: string) {
  trackEvent('pubblicazione_avviata', { slug });
}

export function tracciaPubblicazioneRiuscita(slug: string, url: string) {
  trackEvent('pubblicazione_riuscita', { slug, url: url.substring(0, 200) });
}

export function tracciaErrorePubblicazione(messaggio_errore: string) {
  trackEvent('errore_pubblicazione', { messaggio_errore: messaggio_errore.substring(0, 200) });
}

export function tracciaLinkPubblicazioneCondiviso(slug: string) {
  trackEvent('link_pubblicazione_condiviso', { slug });
}

export function tracciaUrlPubblicazioneAperto(slug: string) {
  trackEvent('url_pubblicazione_aperto', { slug });
}

export function tracciaDePubblicato(slug: string) {
  trackEvent('de_pubblicato', { slug });
}

// ── Git ─────────────────────────────────────────────

export function tracciaAzioneGit(azione: string) {
  trackEvent('azione_git', { azione });
}

export function tracciaCommitCreato() {
  trackEvent('commit_creato');
}

export function tracciaCambioBranch(branch: string) {
  trackEvent('cambio_branch', { branch: branch.substring(0, 100) });
}

export function tracciaPushEffettuato() {
  trackEvent('push_effettuato');
}

export function tracciaAuthGit(provider: string) {
  trackEvent('auth_git', { provider });
}

export function tracciaAuthGitRiuscita(provider: string) {
  trackEvent('auth_git_riuscita', { provider });
}

export function tracciaErroreAuthGit(provider: string, messaggio_errore: string) {
  trackEvent('errore_auth_git', { provider, messaggio_errore: messaggio_errore.substring(0, 200) });
}

export function tracciaAccountGitRimosso(provider: string) {
  trackEvent('account_git_rimosso', { provider });
}

export function tracciaRepoConnesso(url_repo: string) {
  trackEvent('repo_connesso', { url_repo: url_repo.substring(0, 200) });
}

export function tracciaRepoImportato(nome_repo: string) {
  trackEvent('repo_importato', { nome_repo: nome_repo.substring(0, 100) });
}

export function tracciaImportGitAvviato() {
  trackEvent('import_git_avviato');
}

export function tracciaImportGitAnnullato() {
  trackEvent('import_git_annullato');
}

export function tracciaImportGitConfermato(url_repo: string) {
  trackEvent('import_git_confermato', { url_repo: url_repo.substring(0, 200) });
}

export function tracciaTabGitCambiato(tab: string) {
  trackEvent('tab_git_cambiato', { tab });
}

export function tracciaBranchCreato(branch: string) {
  trackEvent('branch_creato', { branch: branch.substring(0, 100) });
}

export function tracciaCronologiaCommit() {
  trackEvent('cronologia_commit');
}

export function tracciaSelezionaTuttoGit() {
  trackEvent('seleziona_tutto_git');
}

export function tracciaAccountGitCollegato(provider: string) {
  trackEvent('account_git_collegato', { provider });
}

export function tracciaAccountGitScollegato(provider: string) {
  trackEvent('account_git_scollegato', { provider });
}

export function tracciaConnettiRepo() {
  trackEvent('connetti_repo');
}

// ── Impostazioni ────────────────────────────────────

export function tracciaImpostazioniAperte(modale: string) {
  trackEvent('impostazioni_aperte', { modale });
}

export function tracciaImpostazioniChiuse(modale: string) {
  trackEvent('impostazioni_chiuse', { modale });
}

export function tracciaLinguaCambiata(lingua: string) {
  trackEvent('lingua_cambiata', { lingua });
}

export function tracciaPasswordCambiata() {
  trackEvent('password_cambiata');
}

export function tracciaErroreCambioPassword(messaggio_errore: string) {
  trackEvent('errore_cambio_password', { messaggio_errore: messaggio_errore.substring(0, 200) });
}

export function tracciaEmailCambiata() {
  trackEvent('email_cambiata');
}

export function tracciaErroreCambioEmail(messaggio_errore: string) {
  trackEvent('errore_cambio_email', { messaggio_errore: messaggio_errore.substring(0, 200) });
}

export function tracciaNomeCambiato() {
  trackEvent('nome_cambiato');
}

export function tracciaVarAmbienteAggiunta(chiave: string) {
  trackEvent('var_ambiente_aggiunta', { chiave: chiave.substring(0, 50) });
}

export function tracciaVarAmbienteRimossa(chiave: string) {
  trackEvent('var_ambiente_rimossa', { chiave: chiave.substring(0, 50) });
}

export function tracciaNotificheToggle(tipo: string, attivo: string) {
  trackEvent('notifiche_toggle', { tipo, attivo });
}

export function tracciaAcquistiRipristinati() {
  trackEvent('acquisti_ripristinati');
}

export function tracciaDocumentoLegaleVisto(tipo: string) {
  trackEvent('documento_legale_visto', { tipo });
}

// ── Piani & Fatturazione ────────────────────────────

export function tracciaPianoVisualizzato(piano: string) {
  trackEvent('piano_visualizzato', { piano });
}

export function tracciaAcquistoAvviato(prodotto: string) {
  trackEvent('acquisto_avviato', { prodotto });
}

export function tracciaAcquistoCompletato(prodotto: string, piano: string) {
  trackEvent('acquisto_completato', { prodotto, piano });
}

export function tracciaErroreAcquisto(prodotto: string, tipo_errore: string) {
  trackEvent('errore_acquisto', { prodotto, tipo_errore });
}

export function tracciaPaginaPianiVista(sorgente: string) {
  trackEvent('pagina_piani_vista', { sorgente });
}

export function tracciaPaginaPianiChiusa() {
  trackEvent('pagina_piani_chiusa');
}

export function tracciaCicloFatturazioneCambiato(ciclo: string) {
  trackEvent('ciclo_fatturazione_cambiato', { ciclo });
}

// ── Onboarding ──────────────────────────────────────

export function tracciaOnboardingStepCompletato(step: string) {
  trackEvent('onboarding_step_completato', { step });
}

export function tracciaOnboardingStepSaltato(step: string) {
  trackEvent('onboarding_step_saltato', { step });
}

export function tracciaOnboardingEsperienzaScelta(livello: string) {
  trackEvent('onboarding_esperienza_scelta', { livello });
}

export function tracciaOnboardingScopertaScelta(fonte: string) {
  trackEvent('onboarding_scoperta_scelta', { fonte });
}

export function tracciaOnboardingCompletato() {
  trackEvent('onboarding_completato');
}

export function tracciaOnboardingPianoScelto(piano: string) {
  trackEvent('onboarding_piano_scelto', { piano });
}

export function tracciaOnboardingIndietro(da_step: string) {
  trackEvent('onboarding_indietro', { da_step });
}

export function tracciaTutorialStepAvanzato(indice: string, nome_step: string) {
  trackEvent('tutorial_step_avanzato', { indice, nome_step });
}

export function tracciaTutorialSaltato(indice: string) {
  trackEvent('tutorial_saltato', { indice });
}

// ── 9 Nuove Funzioni ───────────────────────────────

export function tracciaOnboardingSceltaProgetto(scelta: string) {
  trackEvent('onboarding_scelta_progetto', { scelta });
}

export function tracciaOnboardingIdeaChip(idea: string) {
  trackEvent('onboarding_idea_chip', { idea });
}

export function tracciaImmagineCaricata(sorgente: string) {
  trackEvent('immagine_caricata', { sorgente });
}

export function tracciaModalitaChatCambiata(modalita: string) {
  trackEvent('modalita_chat_cambiata', { modalita });
}

export function tracciaPianoApprovatoAgente() {
  trackEvent('piano_approvato_agente');
}

export function tracciaTemaCambiato(tema: string) {
  trackEvent('tema_cambiato', { tema });
}

export function tracciaProgettoImportato(nome: string, url_repo: string) {
  trackEvent('progetto_importato', { nome, url_repo: url_repo.substring(0, 200) });
}

export function tracciaSidebarToggle(aperta: string) {
  trackEvent('sidebar_toggle', { aperta });
}

export function tracciaCopiaCodicePremuto() {
  trackEvent('copia_codice');
}

