import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

interface LegalPageProps {
  type: 'privacy' | 'terms';
  onClose: () => void;
}

const PRIVACY_POLICY = `Ultimo aggiornamento: febbraio 2026

1. INTRODUZIONE

Drape ("noi", "nostro") è un ambiente di sviluppo integrato (IDE) mobile che consente di creare, modificare e gestire progetti software direttamente dal tuo dispositivo. La presente informativa descrive come raccogliamo, utilizziamo e proteggiamo i tuoi dati personali.

2. DATI CHE RACCOGLIAMO

2.1 Dati dell'account
Quando crei un account, raccogliamo:
• Indirizzo email
• Nome visualizzato
• Metodo di autenticazione (email/password, Google, Apple)

2.2 Dati di utilizzo
Raccogliamo automaticamente:
• Identificativo del dispositivo (per gestione sessioni)
• Dati relativi ai progetti creati (nome, tipo, configurazione)
• Log di interazione con l'assistente AI (prompt e risposte)
• Statistiche di utilizzo del budget AI

2.3 Dati di pagamento
I pagamenti degli abbonamenti sono gestiti interamente da Apple tramite il sistema In-App Purchase. Non raccogliamo né memorizziamo dati di carte di credito o informazioni finanziarie. Riceviamo da Apple solo l'identificativo della transazione per verificare lo stato dell'abbonamento.

3. COME UTILIZZIAMO I DATI

Utilizziamo i tuoi dati per:
• Fornire e mantenere il servizio Drape
• Gestire il tuo account e le preferenze
• Elaborare le richieste all'assistente AI
• Gestire i limiti del piano di abbonamento
• Inviare notifiche push (se autorizzate) relative allo stato dei tuoi progetti
• Migliorare il servizio e correggere errori

4. SERVIZI DI TERZE PARTI

4.1 Firebase (Google)
Utilizziamo Firebase per:
• Autenticazione (Firebase Authentication)
• Archiviazione dati (Cloud Firestore)
• Notifiche push (Firebase Cloud Messaging)
I dati sono conservati su server Google conformi al GDPR.

4.2 Servizi AI
Le richieste all'assistente AI vengono elaborate tramite provider di intelligenza artificiale. I prompt vengono inviati in forma anonimizzata, senza associazione diretta al tuo account.

4.3 Apple In-App Purchase
Apple gestisce tutti i pagamenti. Consulta l'informativa privacy di Apple per i dettagli sulla gestione dei dati di pagamento.

5. CONSERVAZIONE DEI DATI

I dati del tuo account vengono conservati finché mantieni un account attivo. I dati dei progetti vengono conservati per la durata del progetto. Puoi richiedere la cancellazione dei tuoi dati in qualsiasi momento.

6. SICUREZZA

Adottiamo misure tecniche e organizzative per proteggere i tuoi dati:
• Comunicazioni crittografate (HTTPS/TLS)
• Autenticazione sicura tramite Firebase
• Accesso ai dati limitato al proprietario dell'account
• Ambiente di esecuzione isolato per ogni progetto (container Docker)

7. I TUOI DIRITTI

Hai il diritto di:
• Accedere ai tuoi dati personali
• Correggere dati inesatti
• Richiedere la cancellazione del tuo account e dei dati associati
• Esportare i tuoi dati
• Revocare il consenso alle notifiche push

Per esercitare questi diritti, contattaci all'indirizzo indicato di seguito.

8. MINORI

Drape non è destinato a minori di 13 anni. Non raccogliamo consapevolmente dati di minori.

9. MODIFICHE

Ci riserviamo il diritto di aggiornare questa informativa. Le modifiche significative verranno comunicate tramite l'app.

10. CONTATTI

Per domande sulla privacy:
Email: leon.rivas@drape-dev.it`;

const TERMS_OF_SERVICE = `Ultimo aggiornamento: febbraio 2026

1. ACCETTAZIONE DEI TERMINI

Utilizzando Drape ("l'App"), accetti i presenti Termini di Servizio. Se non accetti, non utilizzare l'App.

2. DESCRIZIONE DEL SERVIZIO

Drape è un ambiente di sviluppo integrato (IDE) mobile che offre:
• Creazione e gestione di progetti software
• Editor di codice con anteprima in tempo reale
• Assistente AI per lo sviluppo
• Gestione repository Git (GitHub, GitLab, Bitbucket)
• Archiviazione cloud dei progetti

3. ACCOUNT

3.1 Registrazione
Per utilizzare Drape devi creare un account. Sei responsabile di mantenere riservate le credenziali del tuo account.

3.2 Un dispositivo alla volta
Per motivi di sicurezza, il tuo account può essere attivo su un solo dispositivo alla volta. L'accesso da un nuovo dispositivo terminerà la sessione attiva.

3.3 Contenuto dell'utente
Mantieni la proprietà di tutto il codice e i contenuti che crei tramite Drape. Sei responsabile dei contenuti che carichi e dei progetti che crei.

4. ABBONAMENTI E PAGAMENTI

4.1 Piani
Drape offre diversi piani: Starter (gratuito), Go e Pro. Le funzionalità e i limiti di ciascun piano sono descritti nell'App.

4.2 Fatturazione
• I pagamenti sono gestiti tramite Apple In-App Purchase
• Il pagamento viene addebitato sul tuo account Apple ID alla conferma dell'acquisto
• L'abbonamento si rinnova automaticamente a meno che non venga disattivato almeno 24 ore prima della scadenza del periodo corrente
• Il costo del rinnovo viene addebitato nelle 24 ore precedenti la fine del periodo corrente
• Puoi gestire e cancellare i tuoi abbonamenti nelle Impostazioni del tuo account Apple ID dopo l'acquisto

4.3 Rimborsi
I rimborsi sono gestiti da Apple secondo le loro politiche. Puoi richiedere un rimborso tramite reportaproblem.apple.com.

5. UTILIZZO DELL'ASSISTENTE AI

5.1 Budget AI
Ogni piano ha un budget AI mensile. L'utilizzo viene tracciato e il budget si resetta mensilmente.

5.2 Contenuto generato dall'AI
L'assistente AI genera suggerimenti e codice. Sei responsabile della verifica e dell'utilizzo del contenuto generato. Non garantiamo l'accuratezza o la completezza delle risposte AI.

6. LIMITAZIONI D'USO

Non puoi:
• Utilizzare l'App per attività illegali
• Tentare di aggirare i limiti del piano o le misure di sicurezza
• Condividere le credenziali del tuo account
• Utilizzare l'App per creare contenuti dannosi o malevoli
• Effettuare reverse engineering dell'App

7. PROPRIETÀ INTELLETTUALE

L'App Drape, il suo design, il codice sorgente e i marchi sono di proprietà di Drape. L'utente ottiene una licenza limitata, non esclusiva e non trasferibile per l'utilizzo dell'App.

8. DISPONIBILITÀ DEL SERVIZIO

Ci impegniamo a mantenere il servizio disponibile, ma non garantiamo un funzionamento ininterrotto. Potremmo effettuare manutenzione o aggiornamenti che comportano interruzioni temporanee.

9. LIMITAZIONE DI RESPONSABILITÀ

Drape viene fornito "così com'è". Non siamo responsabili per:
• Perdita di dati o codice dovuta a malfunzionamenti
• Danni derivanti dall'utilizzo del contenuto generato dall'AI
• Interruzioni del servizio
• Problemi causati da servizi di terze parti

La nostra responsabilità è limitata all'importo pagato per l'abbonamento negli ultimi 12 mesi.

10. RISOLUZIONE

Possiamo sospendere o terminare il tuo account in caso di violazione dei presenti termini. Puoi cancellare il tuo account in qualsiasi momento dalle impostazioni dell'App.

11. MODIFICHE AI TERMINI

Ci riserviamo il diritto di modificare i presenti termini. Le modifiche significative verranno comunicate tramite l'App con almeno 30 giorni di preavviso.

12. LEGGE APPLICABILE

I presenti termini sono regolati dalla legge italiana. Per qualsiasi controversia sarà competente il Foro di riferimento.

13. CONTATTI

Per domande sui termini di servizio:
Email: leon.rivas@drape-dev.it`;

export const LegalPage: React.FC<LegalPageProps> = ({ type, onClose }) => {
  const insets = useSafeAreaInsets();
  const title = type === 'privacy' ? 'Privacy Policy' : 'Termini di Servizio';
  const content = type === 'privacy' ? PRIVACY_POLICY : TERMS_OF_SERVICE;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.closeButton} />
      </View>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {content.split('\n').map((line, i) => {
          const trimmed = line.trim();
          if (!trimmed) return <View key={i} style={styles.spacer} />;

          // Section headers (numbered like "1. TITLE")
          if (/^\d+\.\s+[A-ZÀÈÉÌÒÙ]/.test(trimmed)) {
            return <Text key={i} style={styles.sectionHeader}>{trimmed}</Text>;
          }
          // Sub-headers (like "2.1 Title")
          if (/^\d+\.\d+\s/.test(trimmed)) {
            return <Text key={i} style={styles.subHeader}>{trimmed}</Text>;
          }
          // Bullet points
          if (trimmed.startsWith('•')) {
            return <Text key={i} style={styles.bullet}>{trimmed}</Text>;
          }
          // Date line
          if (trimmed.startsWith('Ultimo aggiornamento')) {
            return <Text key={i} style={styles.date}>{trimmed}</Text>;
          }
          // Regular text
          return <Text key={i} style={styles.paragraph}>{trimmed}</Text>;
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A0A0C',
    zIndex: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  spacer: {
    height: 10,
  },
  date: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 16,
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginTop: 20,
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  subHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 12,
    marginBottom: 6,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 4,
  },
  bullet: {
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.6)',
    paddingLeft: 8,
    marginBottom: 2,
  },
});
