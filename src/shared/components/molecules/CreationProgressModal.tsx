import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    Animated,
    Easing,
    Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppColors } from '../../theme/colors';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Line } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Container is bigger than the sphere so it can expand without clipping
const CONTAINER_SIZE = Math.min(SCREEN_WIDTH * 0.9, 400);
const SPHERE_SIZE = CONTAINER_SIZE * 0.65;
const NUM_PARTICLES = 320;
const NUM_CORE_PARTICLES = 50;
const SPHERE_RADIUS = SPHERE_SIZE / 2;
const CORE_RADIUS = SPHERE_RADIUS * 0.22; // inner nucleus radius
const MIN_FRAME_MS = 50; // ~20fps target — degrades gracefully under JS pressure
const TIME_SCALE = 0.85; // global animation speed multiplier

// Pre-compute particle positions on a sphere using Fibonacci distribution
// Each particle gets its own random drift parameters for organic movement
function generateSphereParticles(count: number, radius: number) {
    const particles: {
        x: number; y: number; z: number;
        size: number; opacity: number;
        // Individual drift: each particle wanders on its own
        driftSpeedX: number; driftSpeedY: number; driftSpeedZ: number;
        driftAmplitude: number;
        phaseX: number; phaseY: number; phaseZ: number;
        twinkleSpeed: number; twinklePhase: number;
    }[] = [];
    const goldenRatio = (1 + Math.sqrt(5)) / 2;

    for (let i = 0; i < count; i++) {
        const theta = Math.acos(1 - (2 * (i + 0.5)) / count);
        const phi = (2 * Math.PI * i) / goldenRatio;

        const x = radius * Math.sin(theta) * Math.cos(phi);
        const y = radius * Math.sin(theta) * Math.sin(phi);
        const z = radius * Math.cos(theta);

        const edgeFactor = Math.abs(Math.sin(theta));
        const size = 0.6 + edgeFactor * 1.8; // smaller, sharper
        const opacity = 0.3 + edgeFactor * 0.7; // brighter

        particles.push({
            x, y, z, size, opacity,
            // Angular drift: particles wander ON the sphere surface, not away from it
            driftSpeedX: 0.25 + Math.random() * 0.7,
            driftSpeedY: 0.25 + Math.random() * 0.7,
            driftSpeedZ: 0.12 + Math.random() * 0.45,
            driftAmplitude: 0.06 + Math.random() * 0.15,
            phaseX: Math.random() * Math.PI * 2,
            phaseY: Math.random() * Math.PI * 2,
            phaseZ: Math.random() * Math.PI * 2,
            twinkleSpeed: 0.5 + Math.random() * 1.8,
            twinklePhase: Math.random() * Math.PI * 2,
        });
    }
    return particles;
}

interface ToolEvent {
    type: 'tool_start' | 'tool_complete' | 'tool_error' | 'status' | 'complete' | 'message' | 'thinking' | 'iteration_start';
    tool?: string;
    input?: any;
    success?: boolean;
    error?: string;
    message?: string;
    content?: string;
    timestamp?: number;
    iteration?: number;
}

interface Props {
    visible: boolean;
    progress: number;
    status: string;
    step?: string;
    agentEvents?: ToolEvent[];
    agentStatus?: 'idle' | 'running' | 'complete' | 'error';
    agentCurrentTool?: string | null;
}

type PhraseBank = Record<string, { it: string[]; en: string[] }>;

const PHRASES: PhraseBank = {
    read_file: {
        it: [
            'Sto leggendo il codice...',
            'Analizzo i file esistenti...',
            'Scorro il progetto...',
            'Do un\'occhiata ai file...',
            'Studio il codice sorgente...',
            'Controllo cosa c\'è già...',
            'Leggo la struttura attuale...',
            'Ispeziono i sorgenti...',
        ],
        en: [
            'Reading through the code...',
            'Analyzing existing files...',
            'Scanning the project...',
            'Browsing the files...',
            'Studying the source...',
            'Checking what\'s there...',
            'Inspecting the sources...',
            'Taking a look at the files...',
        ],
    },
    write_file: {
        it: [
            'Scrivo un nuovo file...',
            'Creo il componente...',
            'Genero codice fresco...',
            'Metto giù le prime righe...',
            'Compongo un nuovo file...',
            'Costruisco il modulo...',
            'Sto scrivendo codice...',
            'Preparo un nuovo componente...',
        ],
        en: [
            'Writing a new file...',
            'Creating a component...',
            'Generating fresh code...',
            'Laying down new code...',
            'Composing a new file...',
            'Building the module...',
            'Crafting code...',
            'Putting together a component...',
        ],
    },
    edit_file: {
        it: [
            'Modifico il file...',
            'Aggiorno il codice...',
            'Rifinisco i dettagli...',
            'Sistemo l\'implementazione...',
            'Ritocco il codice...',
            'Aggiusto qualche riga...',
            'Metto a punto il file...',
        ],
        en: [
            'Editing the file...',
            'Updating the code...',
            'Refining the details...',
            'Polishing the implementation...',
            'Tweaking the code...',
            'Adjusting a few lines...',
            'Fine-tuning the file...',
        ],
    },
    run_command: {
        it: [
            'Eseguo un comando...',
            'Lancio il terminale...',
            'Faccio girare uno script...',
            'Avvio un processo...',
            'Eseguo nel terminale...',
        ],
        en: [
            'Running a command...',
            'Firing up the terminal...',
            'Executing a script...',
            'Launching a process...',
            'Running in the shell...',
        ],
    },
    glob_search: {
        it: [
            'Cerco i file giusti...',
            'Scansiono i path...',
            'Vado a caccia di file...',
            'Cerco nella struttura...',
        ],
        en: [
            'Hunting for files...',
            'Scanning paths...',
            'Finding the right files...',
            'Searching the tree...',
        ],
    },
    grep_search: {
        it: [
            'Cerco nel codice...',
            'Analizzo i pattern...',
            'Faccio pattern matching...',
            'Scavo nel sorgente...',
        ],
        en: [
            'Searching the code...',
            'Analyzing patterns...',
            'Matching patterns...',
            'Digging through source...',
        ],
    },
    todo_write: {
        it: [
            'Pianifico i prossimi passi...',
            'Organizzo il lavoro...',
            'Segno le cose da fare...',
            'Definisco i task...',
            'Metto in ordine le priorità...',
        ],
        en: [
            'Planning next steps...',
            'Organizing the work...',
            'Listing what\'s next...',
            'Defining the tasks...',
            'Sorting out priorities...',
        ],
    },
    list_directory: {
        it: [
            'Esploro la struttura...',
            'Navigo tra le cartelle...',
            'Controllo le directory...',
            'Do un\'occhiata alle cartelle...',
        ],
        en: [
            'Exploring the structure...',
            'Browsing folders...',
            'Checking directories...',
            'Looking around the tree...',
        ],
    },
    web_search: {
        it: [
            'Cerco informazioni online...',
            'Faccio ricerca sul web...',
            'Consulto la documentazione...',
            'Verifico i dettagli online...',
        ],
        en: [
            'Searching online...',
            'Researching on the web...',
            'Checking documentation...',
            'Verifying details online...',
        ],
    },
    web_fetch: {
        it: [
            'Scarico contenuti...',
            'Recupero dati dal web...',
            'Leggo la documentazione...',
            'Prelevo informazioni...',
        ],
        en: [
            'Fetching content...',
            'Pulling data from the web...',
            'Reading the docs...',
            'Grabbing information...',
        ],
    },
    signal_completion: {
        it: [
            'Ci siamo quasi...',
            'Ultimi ritocchi...',
            'Rifiniture finali...',
            'Quasi pronto...',
        ],
        en: [
            'Almost there...',
            'Final touches...',
            'Wrapping things up...',
            'Nearly ready...',
        ],
    },
    dispatch_agent: {
        it: [
            'Delego un compito...',
            'Chiamo un altro agente...',
            'Inoltro il lavoro...',
        ],
        en: [
            'Delegating a task...',
            'Calling another agent...',
            'Handing off the job...',
        ],
    },
    _default: {
        it: [
            'Sto pensando...',
            'Ragiono sul problema...',
            'Rifletto un attimo...',
            'Elaboro...',
            'Sto lavorando...',
        ],
        en: [
            'Thinking...',
            'Figuring it out...',
            'Working on it...',
            'Processing...',
            'Working things out...',
        ],
    },
    _complete: {
        it: [
            'Progetto pronto!',
            'Fatto! Preview in arrivo...',
            'Tutto a posto!',
        ],
        en: [
            'Project ready!',
            'Done! Preview coming up...',
            'All set!',
        ],
    },
};

const pickPhrase = (tool: string, counter: number, lang: 'it' | 'en'): string => {
    const bank = PHRASES[tool] || PHRASES._default;
    const list = bank[lang];
    return list[counter % list.length];
};

// Animated SVG Circle wrapper
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Shimmer text — breathing opacity sweep like Siri/assistant UI
const ShimmerText = ({ text, style }: { text: string; style?: any }) => {
    const shimmerAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(shimmerAnim, {
                    toValue: 1,
                    duration: 1400,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(shimmerAnim, {
                    toValue: 0,
                    duration: 1400,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, []);

    const opacity = shimmerAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.45, 1],
    });

    return <Animated.Text style={[style, { opacity }]}>{text}</Animated.Text>;
};

// Core particles — small cluster at the center with random volumetric positions.
// Unlike outer particles (distributed on a sphere SURFACE), core particles fill
// a small volume to create a dense, bright nucleus.
function generateCoreParticles(count: number, radius: number) {
    const particles: {
        x: number; y: number; z: number;
        size: number; baseOpacity: number;
        orbitSpeed: number; orbitPhase: number;
        pulseSpeed: number; pulsePhase: number;
        colorIdx: number;
    }[] = [];
    for (let i = 0; i < count; i++) {
        // Random point inside sphere volume (cube-root for uniform distribution)
        const r = radius * Math.cbrt(Math.random());
        const theta = Math.acos(2 * Math.random() - 1);
        const phi = 2 * Math.PI * Math.random();
        particles.push({
            x: r * Math.sin(theta) * Math.cos(phi),
            y: r * Math.sin(theta) * Math.sin(phi),
            z: r * Math.cos(theta),
            size: 0.9 + Math.random() * 1.3,
            baseOpacity: 0.75 + Math.random() * 0.25,
            orbitSpeed: 0.4 + Math.random() * 0.8,
            orbitPhase: Math.random() * Math.PI * 2,
            pulseSpeed: 1.5 + Math.random() * 2.5,
            pulsePhase: Math.random() * Math.PI * 2,
            colorIdx: Math.floor(Math.random() * 5), // 5 colors in the palette
        });
    }
    return particles;
}

// Particle sphere component
const ParticleSphere = React.memo(({ isActive }: { isActive: boolean; progress: number }) => {
    const baseParticles = useMemo(() => generateSphereParticles(NUM_PARTICLES, SPHERE_RADIUS), []);
    const coreParticles = useMemo(() => generateCoreParticles(NUM_CORE_PARTICLES, CORE_RADIUS), []);

    // Incremental time — advances only when a tick actually runs. JS freezes cause
    // a brief pause (no teleport) instead of a visible jump when the thread resumes.
    const timeRef = useRef(0);
    const lastTickRef = useRef(0);
    const [, forceRender] = useState(0);

    useEffect(() => {
        if (!isActive) return;
        timeRef.current = 0;
        lastTickRef.current = Date.now();
        let mounted = true;
        let rafId = 0;

        const tick = () => {
            if (!mounted) return;
            const now = Date.now();
            const dt = now - lastTickRef.current;
            // Throttle: don't render more often than MIN_FRAME_MS
            if (dt >= MIN_FRAME_MS) {
                // Clamp dt so long freezes don't jump animation forward
                const advance = Math.min(dt, MIN_FRAME_MS * 2) / 1000 * TIME_SCALE;
                timeRef.current += advance;
                lastTickRef.current = now;
                forceRender(n => (n + 1) % 1000);
            }
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);

        return () => { mounted = false; cancelAnimationFrame(rafId); };
    }, [isActive]);

    const time = timeRef.current;
    const center = CONTAINER_SIZE / 2;

    // Global rotation
    const globalAngleY = time * 0.18;
    const globalAngleX = time * 0.11;
    const cosGY = Math.cos(globalAngleY);
    const sinGY = Math.sin(globalAngleY);
    const cosGX = Math.cos(globalAngleX);
    const sinGX = Math.sin(globalAngleX);

    // Continuous breathing pulse — strong and always visible
    // Two sine waves combined for organic feel; always oscillates 0.85 → 1.25
    const breathe = 1 + Math.sin(time * 0.7) * 0.15 + Math.sin(time * 1.3) * 0.05;
    const totalBreathe = breathe;

    // All purple palette
    const COLORS = ['#8B5CF6', '#A78BFA', '#7C3AED', '#9F7AEA', '#C4B5FD'];

    // Pre-calculate all visible particle screen positions for connection lines
    const projected: { sx: number; sy: number; alpha: number; size: number; colorIdx: number }[] = [];

    // Core pulse — breathes slightly out of sync with the sphere
    const corePulse = 1 + Math.sin(time * 1.1) * 0.12 + Math.sin(time * 2.3) * 0.05;

    return (
        <View style={[sphereStyles.container, { width: CONTAINER_SIZE, height: CONTAINER_SIZE }]}>
            <Svg width={CONTAINER_SIZE} height={CONTAINER_SIZE} viewBox={`0 0 ${CONTAINER_SIZE} ${CONTAINER_SIZE}`}>
                {/* First pass: calculate positions + render particles */}
                {baseParticles.map((p, i) => {
                    // Angular drift: rotate particle position on sphere surface
                    const dTheta = Math.sin(time * p.driftSpeedX + p.phaseX) * p.driftAmplitude;
                    const dPhi = Math.cos(time * p.driftSpeedY + p.phaseY) * p.driftAmplitude;

                    // Apply small angular rotation to the base position (stays on sphere)
                    const cosDT = Math.cos(dTheta), sinDT = Math.sin(dTheta);
                    const cosDP = Math.cos(dPhi), sinDP = Math.sin(dPhi);
                    // Rotate around Y axis by dTheta
                    let px = p.x * cosDT - p.z * sinDT;
                    let py = p.y;
                    let pz = p.x * sinDT + p.z * cosDT;
                    // Rotate around X axis by dPhi
                    const py2 = py * cosDP - pz * sinDP;
                    pz = py * sinDP + pz * cosDP;
                    py = py2;

                    // Global rotation
                    let x1 = px * cosGY - pz * sinGY;
                    let z1 = px * sinGY + pz * cosGY;
                    let y2 = py * cosGX - z1 * sinGX;
                    let z2 = py * sinGX + z1 * cosGX;

                    const depth = (z2 + SPHERE_RADIUS * 1.3) / (2.6 * SPHERE_RADIUS);
                    if (depth < 0.32) return null; // aggressive back-face culling for perf

                    const scale = 0.3 + depth * 0.7;
                    const twinkle = 0.4 + Math.sin(time * p.twinkleSpeed + p.twinklePhase) * 0.6;
                    const pulse = 1 + Math.sin(time * 1.2 + p.phaseX * 2) * 0.18;
                    const alpha = p.opacity * scale * twinkle * totalBreathe;
                    if (alpha < 0.1) return null;

                    const sx = center + x1 * totalBreathe;
                    const sy = center + y2 * totalBreathe;
                    const colorIdx = i % COLORS.length;
                    const pulsedSize = p.size * scale * pulse;

                    // Store for connection lines
                    projected.push({ sx, sy, alpha, size: pulsedSize, colorIdx });

                    return (
                        <Circle
                            key={`p${i}`}
                            cx={sx}
                            cy={sy}
                            r={pulsedSize}
                            fill={COLORS[colorIdx]}
                            opacity={Math.min(0.95, alpha)}
                        />
                    );
                })}

                {/* Jarvis neural-net connection lines */}
                {projected.length > 0 && projected.map((a, i) => {
                    if (i % 2 !== 0) return null;
                    const lines: React.ReactElement[] = [];
                    const MAX_DIST = 40;
                    const MAX_DIST_SQ = MAX_DIST * MAX_DIST;
                    const end = Math.min(i + 9, projected.length);
                    for (let j = i + 1; j < end; j++) {
                        const b = projected[j];
                        const dx = a.sx - b.sx;
                        const dy = a.sy - b.sy;
                        const distSq = dx * dx + dy * dy;
                        if (distSq > MAX_DIST_SQ || distSq < 16) continue;
                        const dist = Math.sqrt(distSq);
                        const lineAlpha = Math.pow(1 - dist / MAX_DIST, 1.3) * 0.65 * Math.min(a.alpha, b.alpha);
                        if (lineAlpha > 0.03) {
                            lines.push(
                                <Line
                                    key={`l${i}-${j}`}
                                    x1={a.sx} y1={a.sy}
                                    x2={b.sx} y2={b.sy}
                                    stroke={COLORS[a.colorIdx]}
                                    strokeWidth={0.9}
                                    opacity={lineAlpha}
                                />
                            );
                        }
                    }
                    return lines;
                })}

                {/* Core nucleus particles — pre-compute screen positions, same palette as outer */}
                {(() => {
                    const coreProjected: { sx: number; sy: number; alpha: number; size: number; colorIdx: number }[] = [];
                    const circles: React.ReactElement[] = [];
                    for (let i = 0; i < coreParticles.length; i++) {
                        const p = coreParticles[i];
                        const drift = p.orbitSpeed * time + p.orbitPhase;
                        const cosD = Math.cos(drift);
                        const sinD = Math.sin(drift);
                        let cx = p.x * cosD - p.z * sinD;
                        let cz = p.x * sinD + p.z * cosD;
                        const halfD = drift * 0.6;
                        const cosH = Math.cos(halfD);
                        const sinH = Math.sin(halfD);
                        const cy = p.y * cosH - cz * sinH;
                        cz = p.y * sinH + cz * cosH;

                        const depth = (cz + CORE_RADIUS) / (2 * CORE_RADIUS);
                        const depthScale = 0.6 + depth * 0.4;
                        const pulse = 1 + Math.sin(time * p.pulseSpeed + p.pulsePhase) * 0.35;
                        const alpha = p.baseOpacity * depthScale * pulse * totalBreathe;
                        const sx = center + cx * corePulse;
                        const sy = center + cy * corePulse;
                        const size = p.size * depthScale * pulse;
                        coreProjected.push({ sx, sy, alpha, size, colorIdx: p.colorIdx });

                        circles.push(
                            <Circle
                                key={`c${i}`}
                                cx={sx}
                                cy={sy}
                                r={size}
                                fill={COLORS[p.colorIdx]}
                                opacity={Math.min(1, alpha)}
                            />
                        );
                    }

                    // Core → outer connections: each core particle connects to closest outer particles
                    const coreLines: React.ReactElement[] = [];
                    const CORE_TO_OUTER_DIST = 75;
                    const CORE_TO_OUTER_DIST_SQ = CORE_TO_OUTER_DIST * CORE_TO_OUTER_DIST;
                    for (let i = 0; i < coreProjected.length; i++) {
                        if (i % 2 !== 0) continue; // only half the core particles shoot connections (perf)
                        const a = coreProjected[i];
                        let connectionsMade = 0;
                        for (let j = 0; j < projected.length && connectionsMade < 3; j++) {
                            if (j % 4 !== 0) continue; // sample outer particles
                            const b = projected[j];
                            const dx = a.sx - b.sx;
                            const dy = a.sy - b.sy;
                            const distSq = dx * dx + dy * dy;
                            if (distSq > CORE_TO_OUTER_DIST_SQ || distSq < 100) continue;
                            const dist = Math.sqrt(distSq);
                            const lineAlpha = Math.pow(1 - dist / CORE_TO_OUTER_DIST, 1.4) * 0.5 * Math.min(a.alpha, b.alpha);
                            if (lineAlpha > 0.03) {
                                coreLines.push(
                                    <Line
                                        key={`co${i}-${j}`}
                                        x1={a.sx} y1={a.sy}
                                        x2={b.sx} y2={b.sy}
                                        stroke={COLORS[a.colorIdx]}
                                        strokeWidth={0.7}
                                        opacity={lineAlpha}
                                    />
                                );
                                connectionsMade++;
                            }
                        }
                    }

                    return (
                        <>
                            {coreLines}
                            {circles}
                        </>
                    );
                })()}
            </Svg>
        </View>
    );
}, (prev, next) => prev.isActive === next.isActive);

export const CreationProgressModal = ({ visible, progress, status, step, agentEvents, agentStatus, agentCurrentTool }: Props) => {
    const { t, i18n } = useTranslation('projects');
    const lang: 'it' | 'en' = i18n.language?.toLowerCase().startsWith('it') ? 'it' : 'en';
    const insets = useSafeAreaInsets();
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const [displayProgress, setDisplayProgress] = useState(0);
    const targetProgressRef = useRef(0);
    const initialAction = lang === 'it' ? 'Sto iniziando...' : 'Getting started...';
    const [currentAction, setCurrentAction] = useState(initialAction);
    const [fileCount, setFileCount] = useState(0);
    const phraseCounterRef = useRef(0);
    const currentBankRef = useRef<string>('_default');

    // Entrance animation
    useEffect(() => {
        if (visible) {
            fadeAnim.setValue(0);
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 600,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }).start();
        } else {
            fadeAnim.setValue(0);
            setDisplayProgress(0);
            targetProgressRef.current = 0;
            setFileCount(0);
            phraseCounterRef.current = 0;
            currentBankRef.current = '_default';
            setCurrentAction(initialAction);
        }
    }, [visible]);

    // Track current action from agent events
    useEffect(() => {
        if (!agentEvents || agentEvents.length === 0) return;
        const last = agentEvents[agentEvents.length - 1];

        if (last.type === 'tool_start') {
            currentBankRef.current = last.tool || '_default';
            phraseCounterRef.current += 1;
            setCurrentAction(pickPhrase(currentBankRef.current, phraseCounterRef.current, lang));
        } else if (last.type === 'thinking') {
            currentBankRef.current = '_default';
            phraseCounterRef.current += 1;
            setCurrentAction(pickPhrase('_default', phraseCounterRef.current, lang));
        } else if (last.type === 'complete') {
            currentBankRef.current = '_complete';
            phraseCounterRef.current += 1;
            setCurrentAction(pickPhrase('_complete', phraseCounterRef.current, lang));
        }

        // Count files written
        const writes = agentEvents.filter(e => e.type === 'tool_complete' && e.tool === 'write_file').length;
        if (writes > fileCount) setFileCount(writes);
    }, [agentEvents?.length]);

    // Auto-rotate phrases even when no new events arrive — keeps the UI alive
    useEffect(() => {
        if (!visible) return;
        const interval = setInterval(() => {
            phraseCounterRef.current += 1;
            setCurrentAction(pickPhrase(currentBankRef.current, phraseCounterRef.current, lang));
        }, 2500);
        return () => clearInterval(interval);
    }, [visible, lang]);

    // Smooth progress
    useEffect(() => {
        targetProgressRef.current = Math.max(targetProgressRef.current, Math.min(100, Math.round(progress)));
    }, [progress]);

    useEffect(() => {
        if (!visible) return;
        let mounted = true;
        const interval = setInterval(() => {
            if (!mounted) return;
            setDisplayProgress(prev => {
                const target = targetProgressRef.current;
                if (prev >= target) return target;
                const delta = Math.max(0.3, (target - prev) * 0.15);
                return Math.min(target, prev + delta);
            });
        }, 50);
        return () => { mounted = false; clearInterval(interval); };
    }, [visible]);

    if (!visible) return null;

    const progressPercent = Math.round(displayProgress);

    return (
        <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
            <View style={styles.container}>
                <LinearGradient
                    colors={['#0C0816', '#120A20', '#0C0816']}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                />

                <Animated.View style={[styles.content, { opacity: fadeAnim, paddingTop: insets.top + 40 }]}>
                    {/* Particle Sphere */}
                    <View style={styles.sphereContainer}>
                        <ParticleSphere isActive={visible} progress={displayProgress} />
                    </View>

                    {/* Status text */}
                    <View style={styles.statusContainer}>
                        <ShimmerText text={currentAction} style={styles.actionText} />
                        {fileCount > 0 && (
                            <Text style={styles.fileCount}>{fileCount} files created</Text>
                        )}
                    </View>

                    {/* Bottom progress — tech style with glow */}
                    <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 20 }]}>
                        <View style={styles.progressTrack}>
                            <View style={[styles.progressFill, { width: `${progressPercent}%` }]}>
                                <LinearGradient
                                    colors={['#8B5CF6', '#A78BFA']}
                                    style={StyleSheet.absoluteFill}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                />
                            </View>
                            {/* Glow dot at the leading edge */}
                            {progressPercent > 0 && progressPercent < 100 && (
                                <View style={[styles.progressGlow, { left: `${progressPercent}%` }]} />
                            )}
                        </View>
                        <Text style={styles.progressText}>{progressPercent}%</Text>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
};

const sphereStyles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
});

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0A0806',
    },
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 32,
    },
    sphereContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statusContainer: {
        alignItems: 'center',
        marginBottom: 40,
    },
    actionText: {
        fontSize: 17,
        fontWeight: '500',
        color: 'rgba(255, 255, 255, 0.7)',
        textAlign: 'center',
        letterSpacing: 0.3,
    },
    fileCount: {
        fontSize: 14,
        fontWeight: '400',
        color: 'rgba(255, 255, 255, 0.35)',
        marginTop: 8,
    },
    bottomSection: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    progressTrack: {
        flex: 1,
        height: 2,
        backgroundColor: 'rgba(129, 140, 248, 0.1)',
        borderRadius: 1,
        overflow: 'visible',
        position: 'relative',
    },
    progressFill: {
        height: '100%',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressGlow: {
        position: 'absolute',
        top: -4,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#A78BFA',
        marginLeft: -5,
        shadowColor: '#A78BFA',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 8,
    },
    progressText: {
        fontSize: 13,
        fontWeight: '600',
        color: 'rgba(255, 255, 255, 0.4)',
        fontVariant: ['tabular-nums'],
        minWidth: 36,
        textAlign: 'right',
    },
});
