/**
 * Comprehensive analysis of the last 50 registered users.
 * Usage: npx tsx scripts/user-analysis.ts
 */
import * as admin from 'firebase-admin';
import * as path from 'path';

const serviceAccountPath = path.join(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath),
  });
}
const db = admin.firestore();

interface UserAnalysis {
  uid: string;
  email: string;
  displayName: string;
  provider: string;
  plan: string;
  createdAt: string;
  lastLogin: string;
  lastActiveAt: string;
  onboardingCompleted: boolean;
  hasCreatedFirstProject: boolean;
  hasPushToken: boolean;
  pushPlatform: string;
  projectCount: number;
  projects: { name: string; type: string; status: string; createdAt: string; lastAccessed: string }[];
  eventCount: number;
  screenViews: string[];
  lastEvent: string;
  daysSinceCreation: number;
  daysSinceLastActive: number;
  retentionStatus: string; // 'active' | 'dormant' | 'churned' | 'bounced'
  funnelStage: string;
  issues: string[];
}

function daysBetween(date1: Date, date2: Date): number {
  return Math.floor((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
}

function parseDate(val: any): Date | null {
  if (!val) return null;
  if (val.toDate) return val.toDate();
  if (val._seconds) return new Date(val._seconds * 1000);
  if (typeof val === 'string') return new Date(val);
  if (typeof val === 'number') return new Date(val);
  return null;
}

function formatDate(val: any): string {
  const d = parseDate(val);
  if (!d || isNaN(d.getTime())) return 'N/A';
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

async function main() {
  const now = new Date();
  console.log(`\n${'='.repeat(80)}`);
  console.log(`  ANALISI UTENTI - Ultimi 50 iscritti`);
  console.log(`  Generata: ${now.toISOString().slice(0, 16)}`);
  console.log(`${'='.repeat(80)}\n`);

  // 1. Get last 50 users ordered by createdAt
  const usersSnap = await db.collection('users')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  console.log(`Trovati ${usersSnap.size} utenti\n`);

  const analyses: UserAnalysis[] = [];

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    const uid = userDoc.id;

    // Get user projects
    const projectsSnap = await db.collection('user_projects')
      .where('userId', '==', uid)
      .get();

    const projects = projectsSnap.docs.map(p => {
      const pd = p.data();
      return {
        name: pd.name || 'Unnamed',
        type: pd.type || 'unknown',
        status: pd.status || 'unknown',
        createdAt: formatDate(pd.createdAt),
        lastAccessed: formatDate(pd.lastAccessed),
      };
    });

    // Get user events (no orderBy to avoid missing composite index)
    const eventsSnap = await db.collection('user_events')
      .where('userId', '==', uid)
      .limit(100)
      .get();

    const screenViews = new Set<string>();
    let lastEventTs: Date | null = null;
    for (const ev of eventsSnap.docs) {
      const evData = ev.data();
      if (evData.type === 'screen_view' && evData.screen) {
        screenViews.add(evData.screen);
      }
      const evTs = parseDate(evData.timestamp);
      if (evTs && (!lastEventTs || evTs > lastEventTs)) {
        lastEventTs = evTs;
      }
    }
    const lastEventDate = lastEventTs ? formatDate(lastEventTs) : '';

    const createdAt = parseDate(data.createdAt);
    const lastActiveAt = parseDate(data.lastActiveAt) || parseDate(data.lastLogin);
    const daysSinceCreation = createdAt ? daysBetween(createdAt, now) : -1;
    const daysSinceLastActive = lastActiveAt ? daysBetween(lastActiveAt, now) : -1;

    // Determine push token status
    const hasPushToken = !!(data.pushToken || (data.pushTokens && data.pushTokens.length > 0));
    let pushPlatform = 'none';
    if (data.pushTokens?.length > 0) {
      pushPlatform = data.pushTokens.map((t: any) => t.platform).join(',');
    } else if (data.pushPlatform) {
      pushPlatform = data.pushPlatform;
    }

    // Retention classification
    let retentionStatus = 'active';
    if (daysSinceLastActive > 14) retentionStatus = 'churned';
    else if (daysSinceLastActive > 3) retentionStatus = 'dormant';
    else if (daysSinceLastActive <= 3) retentionStatus = 'active';
    if (projects.length === 0 && daysSinceCreation > 0 && daysSinceLastActive > 0) {
      retentionStatus = 'bounced';
    }

    // Funnel stage
    let funnelStage = '1-registered';
    if (data.onboardingCompleted) funnelStage = '2-onboarded';
    if (projects.length > 0) funnelStage = '3-created_project';
    if (projects.length > 0 && eventsSnap.size > 10) funnelStage = '4-engaged';
    if (data.plan && data.plan !== 'free') funnelStage = '5-paid';

    // Detect issues
    const issues: string[] = [];
    if (!data.onboardingCompleted && !data.hasCreatedFirstProject) {
      issues.push('ONBOARDING_NOT_COMPLETED');
    }
    if (data.onboardingCompleted && projects.length === 0) {
      issues.push('ONBOARDED_BUT_NO_PROJECT');
    }
    if (projects.length > 0 && eventsSnap.size < 5) {
      issues.push('CREATED_PROJECT_LOW_ENGAGEMENT');
    }
    if (!hasPushToken) {
      issues.push('NO_PUSH_TOKEN');
    }
    if (retentionStatus === 'bounced') {
      issues.push('BOUNCED_USER');
    }
    if (retentionStatus === 'churned') {
      issues.push('CHURNED');
    }
    if (daysSinceCreation === 0 && daysSinceLastActive > 0) {
      issues.push('REGISTERED_NEVER_RETURNED');
    }
    if (projects.some(p => p.status === 'creating')) {
      issues.push('PROJECT_STUCK_CREATING');
    }

    analyses.push({
      uid,
      email: data.email || 'N/A',
      displayName: data.displayName || 'N/A',
      provider: data.provider || 'unknown',
      plan: data.plan || 'free',
      createdAt: formatDate(data.createdAt),
      lastLogin: formatDate(data.lastLogin),
      lastActiveAt: formatDate(data.lastActiveAt),
      onboardingCompleted: !!data.onboardingCompleted,
      hasCreatedFirstProject: !!data.hasCreatedFirstProject,
      hasPushToken,
      pushPlatform,
      projectCount: projects.length,
      projects,
      eventCount: eventsSnap.size,
      screenViews: Array.from(screenViews),
      lastEvent: lastEventDate,
      daysSinceCreation,
      daysSinceLastActive,
      retentionStatus,
      funnelStage,
      issues,
    });
  }

  // ==================== INDIVIDUAL USER REPORTS ====================
  console.log(`\n${'─'.repeat(80)}`);
  console.log(`  DETTAGLIO PER UTENTE`);
  console.log(`${'─'.repeat(80)}\n`);

  for (const u of analyses) {
    const statusEmoji = {
      active: '🟢',
      dormant: '🟡',
      churned: '🔴',
      bounced: '⚫',
    }[u.retentionStatus] || '⚪';

    console.log(`${statusEmoji} ${u.displayName} (${u.email})`);
    console.log(`   Provider: ${u.provider} | Piano: ${u.plan} | Iscritto: ${u.createdAt}`);
    console.log(`   Ultimo login: ${u.lastLogin} | Ultimo attivo: ${u.lastActiveAt}`);
    console.log(`   Giorni dall'iscrizione: ${u.daysSinceCreation} | Giorni da ultimo attivo: ${u.daysSinceLastActive}`);
    console.log(`   Onboarding: ${u.onboardingCompleted ? '✅' : '❌'} | Primo progetto: ${u.hasCreatedFirstProject ? '✅' : '❌'}`);
    console.log(`   Progetti: ${u.projectCount} | Eventi: ${u.eventCount} | Push: ${u.hasPushToken ? '✅ ' + u.pushPlatform : '❌'}`);
    console.log(`   Funnel: ${u.funnelStage} | Stato: ${u.retentionStatus}`);
    if (u.projects.length > 0) {
      console.log(`   📁 Progetti:`);
      for (const p of u.projects) {
        console.log(`      - "${p.name}" (${p.type}, ${p.status}) creato: ${p.createdAt}`);
      }
    }
    if (u.screenViews.length > 0) {
      console.log(`   📱 Schermate visitate: ${u.screenViews.join(', ')}`);
    }
    if (u.issues.length > 0) {
      console.log(`   ⚠️  Problemi: ${u.issues.join(', ')}`);
    }
    console.log('');
  }

  // ==================== AGGREGATE STATS ====================
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`  STATISTICHE AGGREGATE`);
  console.log(`${'═'.repeat(80)}\n`);

  // Retention
  const retention = {
    active: analyses.filter(u => u.retentionStatus === 'active').length,
    dormant: analyses.filter(u => u.retentionStatus === 'dormant').length,
    churned: analyses.filter(u => u.retentionStatus === 'churned').length,
    bounced: analyses.filter(u => u.retentionStatus === 'bounced').length,
  };
  console.log(`📊 RETENTION:`);
  console.log(`   🟢 Attivi (< 3gg):     ${retention.active} (${(retention.active / analyses.length * 100).toFixed(0)}%)`);
  console.log(`   🟡 Dormenti (3-14gg):   ${retention.dormant} (${(retention.dormant / analyses.length * 100).toFixed(0)}%)`);
  console.log(`   🔴 Persi (> 14gg):      ${retention.churned} (${(retention.churned / analyses.length * 100).toFixed(0)}%)`);
  console.log(`   ⚫ Rimbalzati (no proj): ${retention.bounced} (${(retention.bounced / analyses.length * 100).toFixed(0)}%)`);

  // Funnel
  const funnel = {
    registered: analyses.filter(u => u.funnelStage === '1-registered').length,
    onboarded: analyses.filter(u => u.funnelStage === '2-onboarded').length,
    createdProject: analyses.filter(u => u.funnelStage === '3-created_project').length,
    engaged: analyses.filter(u => u.funnelStage === '4-engaged').length,
    paid: analyses.filter(u => u.funnelStage === '5-paid').length,
  };
  console.log(`\n📊 FUNNEL:`);
  console.log(`   1. Solo registrati:     ${funnel.registered}`);
  console.log(`   2. Onboarding fatto:    ${funnel.onboarded}`);
  console.log(`   3. Progetto creato:     ${funnel.createdProject}`);
  console.log(`   4. Engaged (>10 ev):    ${funnel.engaged}`);
  console.log(`   5. Paganti:             ${funnel.paid}`);
  const convRegisteredToProject = analyses.length > 0
    ? ((funnel.createdProject + funnel.engaged + funnel.paid) / analyses.length * 100).toFixed(0)
    : '0';
  const convProjectToEngaged = (funnel.createdProject + funnel.engaged + funnel.paid) > 0
    ? ((funnel.engaged + funnel.paid) / (funnel.createdProject + funnel.engaged + funnel.paid) * 100).toFixed(0)
    : '0';
  console.log(`   📉 Conversione registrazione→progetto: ${convRegisteredToProject}%`);
  console.log(`   📉 Conversione progetto→engaged: ${convProjectToEngaged}%`);

  // Provider breakdown
  const providers: Record<string, number> = {};
  analyses.forEach(u => { providers[u.provider] = (providers[u.provider] || 0) + 1; });
  console.log(`\n📊 PROVIDER DI AUTENTICAZIONE:`);
  Object.entries(providers).sort((a, b) => b[1] - a[1]).forEach(([p, c]) => {
    console.log(`   ${p}: ${c} (${(c / analyses.length * 100).toFixed(0)}%)`);
  });

  // Push token coverage
  const withPush = analyses.filter(u => u.hasPushToken).length;
  console.log(`\n📊 PUSH NOTIFICATIONS:`);
  console.log(`   Con token: ${withPush} (${(withPush / analyses.length * 100).toFixed(0)}%)`);
  console.log(`   Senza token: ${analyses.length - withPush} (${((analyses.length - withPush) / analyses.length * 100).toFixed(0)}%)`);

  // Most common issues
  const issueCounts: Record<string, number> = {};
  analyses.forEach(u => u.issues.forEach(i => { issueCounts[i] = (issueCounts[i] || 0) + 1; }));
  console.log(`\n📊 PROBLEMI PIÙ COMUNI:`);
  Object.entries(issueCounts).sort((a, b) => b[1] - a[1]).forEach(([issue, count]) => {
    console.log(`   ${issue}: ${count} utenti (${(count / analyses.length * 100).toFixed(0)}%)`);
  });

  // Average engagement metrics
  const avgEvents = analyses.reduce((s, u) => s + u.eventCount, 0) / analyses.length;
  const avgProjects = analyses.reduce((s, u) => s + u.projectCount, 0) / analyses.length;
  console.log(`\n📊 MEDIE:`);
  console.log(`   Eventi medi per utente: ${avgEvents.toFixed(1)}`);
  console.log(`   Progetti medi per utente: ${avgProjects.toFixed(1)}`);

  // Time-based cohort analysis
  console.log(`\n📊 COORTI PER SETTIMANA:`);
  const weekCohorts: Record<string, UserAnalysis[]> = {};
  analyses.forEach(u => {
    const d = parseDate(u.createdAt);
    if (d) {
      const weekStart = new Date(d);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const key = weekStart.toISOString().slice(0, 10);
      if (!weekCohorts[key]) weekCohorts[key] = [];
      weekCohorts[key].push(u);
    }
  });
  Object.entries(weekCohorts).sort((a, b) => b[0].localeCompare(a[0])).forEach(([week, users]) => {
    const active = users.filter(u => u.retentionStatus === 'active').length;
    const withProject = users.filter(u => u.projectCount > 0).length;
    console.log(`   Sett. ${week}: ${users.length} iscritti | ${active} attivi | ${withProject} con progetto`);
  });

  // ==================== RECOMMENDATIONS ====================
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`  RACCOMANDAZIONI`);
  console.log(`${'═'.repeat(80)}\n`);

  if (retention.bounced > analyses.length * 0.3) {
    console.log(`🚨 CRITICO: ${retention.bounced} utenti (${(retention.bounced / analyses.length * 100).toFixed(0)}%) rimbalzano senza creare un progetto.`);
    console.log(`   → Semplificare il flusso post-registrazione`);
    console.log(`   → Aggiungere template progetto one-click`);
    console.log(`   → Push notification di re-engagement dopo 24h\n`);
  }

  if (issueCounts['ONBOARDING_NOT_COMPLETED'] > analyses.length * 0.2) {
    console.log(`🚨 CRITICO: ${issueCounts['ONBOARDING_NOT_COMPLETED'] || 0} utenti non completano l'onboarding.`);
    console.log(`   → Verificare UX dell'onboarding flow`);
    console.log(`   → Ridurre il numero di step richiesti\n`);
  }

  if (issueCounts['NO_PUSH_TOKEN'] > analyses.length * 0.4) {
    console.log(`⚠️  IMPORTANTE: ${issueCounts['NO_PUSH_TOKEN'] || 0} utenti senza push token.`);
    console.log(`   → Non si possono raggiungere per re-engagement`);
    console.log(`   → Chiedere permesso push in modo più convincente\n`);
  }

  if (issueCounts['CREATED_PROJECT_LOW_ENGAGEMENT'] > 0) {
    console.log(`⚠️  ${issueCounts['CREATED_PROJECT_LOW_ENGAGEMENT']} utenti creano progetto ma hanno pochi eventi.`);
    console.log(`   → Possibile problema con l'esperienza post-creazione`);
    console.log(`   → Verificare tempi di caricamento / errori nei container\n`);
  }

  // Users who could be re-engaged
  const reEngageable = analyses.filter(u =>
    u.hasPushToken &&
    u.retentionStatus === 'dormant' &&
    u.projectCount > 0
  );
  if (reEngageable.length > 0) {
    console.log(`\n💡 UTENTI RECUPERABILI (hanno push + progetto, dormenti):`);
    reEngageable.forEach(u => {
      console.log(`   - ${u.displayName} (${u.email}) — ultimo attivo: ${u.lastActiveAt}`);
    });
  }

  console.log(`\n${'='.repeat(80)}\n`);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
