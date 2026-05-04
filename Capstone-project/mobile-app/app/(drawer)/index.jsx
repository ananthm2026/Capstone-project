import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useDrawer } from '../../src/context/DrawerContext';
import { useUser } from '@clerk/clerk-expo';
import { COLORS } from '../../src/constants/colors';
import { LANGUAGE_LIST } from '../../src/constants/languages';

const { width } = Dimensions.get('window');
const CARD_W = (width - 48) / 2;

const FEATURES = [
  { id: 'n2e', title: 'Speech to Text', desc: 'Push-to-talk with automatic language identification and instant English output', icon: '🎙️', bg: '#FAF0E4', route: '/(drawer)/native-to-english' },
  { id: 'cont', title: 'Continuous Listening', desc: 'Hands-free mode with silence detection for meetings & lectures', icon: '👂', bg: '#E8EEF8', route: '/(drawer)/continuous' },
  { id: 'e2n', title: 'English to Native', desc: 'Translate English text into any Indian language with one tap', icon: '🌐', bg: '#E8F4ED', route: '/english-to-native' },
  { id: 'vis', title: 'Vision Translate', desc: 'Point your camera at any text and get it translated instantly', icon: '📷', bg: '#F5EEF8', route: '/vision' },
  { id: 'vid', title: 'Video Translate', desc: 'Upload a video and get translated transcript with captions', icon: '🎬', bg: '#FDF4E3', route: '/video' },
];

const MORE_ITEMS = [
  { title: 'Settings', icon: '⚙️', route: '/settings' },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomePage() {
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { openDrawer } = useDrawer();
  const firstName = user?.firstName || '';
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={openDrawer} style={s.hamburger}>
          <Text style={s.hamburgerText}>☰</Text>
        </TouchableOpacity>
        <View style={s.headerLeft}>
          <Image source={require('../../assets/logo.png')} style={s.logo} />
          <Text style={s.appName}>SeedlingSpeaks</Text>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 20 }]} showsVerticalScrollIndicator={false}>
        <View style={s.greetingSection}>
          <Text style={s.greeting}>{getGreeting()}{firstName ? `, ${firstName}` : ''} 👋</Text>
          <Text style={s.subtitle}>What would you like to translate today?</Text>
        </View>

        <View style={s.statsRow}>
          {[{ v: '10+', l: 'Languages' }, { v: '4', l: 'Input modes' }, { v: '3', l: 'AI tones' }].map((s2) => (
            <View key={s2.l} style={s.statItem}>
              <Text style={s.statVal}>{s2.v}</Text>
              <Text style={s.statLabel}>{s2.l}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={s.ctaCard} activeOpacity={0.85} onPress={() => router.push('/(drawer)/native-to-english')}>
          <View style={{ flex: 1 }}>
            <Text style={s.ctaTitle}>Start translating</Text>
            <Text style={s.ctaSub}>Speak in your language, get English output instantly</Text>
          </View>
          <Text style={s.ctaArrow}>→</Text>
        </TouchableOpacity>

        <Text style={s.section}>Features</Text>
        <View style={s.grid}>
          {FEATURES.map((f) => (
            <TouchableOpacity key={f.id} style={[s.card, { backgroundColor: f.bg }]} activeOpacity={0.8} onPress={() => router.push(f.route)}>
              <Text style={{ fontSize: 28, marginBottom: 10 }}>{f.icon}</Text>
              <Text style={s.cardTitle}>{f.title}</Text>
              <Text style={s.cardDesc}>{f.desc}</Text>
              <Text style={s.cardArrow}>→</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.section}>More</Text>
        <View style={s.moreRow}>
          {MORE_ITEMS.map((m) => (
            <TouchableOpacity key={m.title} style={s.moreItem} activeOpacity={0.8} onPress={() => router.push(m.route)}>
              <Text style={{ fontSize: 24 }}>{m.icon}</Text>
              <Text style={s.moreText}>{m.title}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.section}>Supported Languages</Text>
        <View style={s.langGrid}>
          {LANGUAGE_LIST.map((l) => (
            <View key={l} style={s.langChip}>
              <Text style={s.langText}>{l}</Text>
            </View>
          ))}
        </View>

        <Text style={s.footer}>v2.5 · Built by Seedlinglabs</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hamburger: { paddingRight: 12, paddingVertical: 4 },
  hamburgerText: { fontSize: 24, color: COLORS.ink },
  logo: { width: 32, height: 32, borderRadius: 16 },
  appName: { fontSize: 18, fontWeight: '700', color: COLORS.ink, letterSpacing: -0.3 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24 },
  greetingSection: { marginBottom: 20 },
  greeting: { fontSize: 26, fontWeight: '700', color: COLORS.ink, letterSpacing: -0.5, marginBottom: 4 },
  subtitle: { fontSize: 15, color: COLORS.muted },
  statsRow: { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 16, marginBottom: 20 },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 22, fontWeight: '800', color: COLORS.saffron, letterSpacing: -0.5 },
  statLabel: { fontSize: 12, color: COLORS.muted, marginTop: 2, fontWeight: '500' },
  ctaCard: { backgroundColor: COLORS.ink, borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 28, ...COLORS.shadowLg },
  ctaTitle: { fontSize: 17, fontWeight: '700', color: '#FFF', marginBottom: 4 },
  ctaSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 18 },
  ctaArrow: { fontSize: 22, color: COLORS.saffron, fontWeight: '700', marginLeft: 12 },
  section: { fontSize: 17, fontWeight: '700', color: COLORS.ink, letterSpacing: -0.3, marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 28 },
  card: { width: CARD_W, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  cardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.ink, marginBottom: 6 },
  cardDesc: { fontSize: 12, color: COLORS.muted, lineHeight: 17, marginBottom: 12 },
  cardArrow: { fontSize: 16, color: COLORS.saffron, fontWeight: '700', alignSelf: 'flex-end' },
  moreRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  moreItem: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  moreText: { fontSize: 12, fontWeight: '600', color: COLORS.warm, marginTop: 6 },
  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 32 },
  langChip: { backgroundColor: COLORS.saffronLight, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(232,130,12,0.20)' },
  langText: { fontSize: 13, color: COLORS.saffronHover, fontWeight: '600' },
  footer: { textAlign: 'center', fontSize: 12, color: COLORS.faded, marginTop: 4 },
});
