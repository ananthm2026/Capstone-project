import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { COLORS, CONFIDENCE_COLOR } from '../../src/constants/colors';
import { useApp } from '../../src/context/AppContext';
import { useNavigation } from '@react-navigation/native';
import { useDrawer } from '../../src/context/DrawerContext';

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { state, deleteHistory, clearHistory, toggleStar, setFields } = useApp();
  const navigation = useNavigation();
  const { openDrawer } = useDrawer();
  const [search, setSearch] = useState('');
  const [showStarred, setShowStarred] = useState(false);

  const { transcriptHistory, starredIds } = state;

  const filtered = transcriptHistory.filter((entry) => {
    if (showStarred && !starredIds.includes(entry.id)) return false;
    if (search && !entry.text?.toLowerCase().includes(search.toLowerCase()) && !entry.native?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function handleRestore(entry) {
    setFields({ englishText: entry.text || '', nativeTranscript: entry.native || '', confidenceScore: entry.confidence || null });
  }

  function handleClearAll() {
    Alert.alert('Clear History', 'Delete all transcript history? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear All', style: 'destructive', onPress: clearHistory },
    ]);
  }

  function fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={openDrawer} style={st.hamburger}>
            <Text style={st.hamburgerText}>☰</Text>
          </TouchableOpacity>
          <View>
            <Text style={st.headerTitle}>History</Text>
            <Text style={st.headerSub}>{transcriptHistory.length} transcripts · last 50 kept</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={[st.filterBtn, showStarred && st.filterBtnActive]} onPress={() => setShowStarred(!showStarred)}>
            <Text style={[st.filterBtnText, showStarred && { color: COLORS.saffron }]}>⭐ Starred</Text>
          </TouchableOpacity>
          {transcriptHistory.length > 0 && (
            <TouchableOpacity style={st.filterBtn} onPress={handleClearAll}>
              <Text style={[st.filterBtnText, { color: COLORS.redSoft }]}>🗑</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={st.searchWrap}>
        <TextInput style={st.searchInput} placeholder="Search transcripts..." placeholderTextColor={COLORS.faded} value={search} onChangeText={setSearch} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[st.list, { paddingBottom: insets.bottom + 20 }]}>
        {filtered.length === 0 ? (
          <View style={st.emptyState}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>🕐</Text>
            <Text style={st.emptyTitle}>{search || showStarred ? 'No matching transcripts' : 'No history yet'}</Text>
            <Text style={st.emptySubtext}>Transcripts will appear here after recording</Text>
          </View>
        ) : (
          filtered.map((entry, i) => {
            const starred = starredIds.includes(entry.id);
            return (
              <View key={entry.id || i} style={st.card}>
                <View style={st.cardHeader}>
                  <View style={st.langPill}>
                    <Text style={st.langPillText}>{entry.language || 'Unknown'}</Text>
                  </View>
                  {entry.confidence != null && (
                    <View style={[st.confBadge, { backgroundColor: CONFIDENCE_COLOR(entry.confidence) + '20' }]}>
                      <Text style={[st.confText, { color: CONFIDENCE_COLOR(entry.confidence) }]}>{entry.confidence}%</Text>
                    </View>
                  )}
                  <Text style={st.dateText}>{fmtDate(entry.timestamp)}</Text>
                </View>
                <Text style={st.previewText} numberOfLines={3}>{entry.text}</Text>
                {entry.native ? <Text style={st.nativePreview} numberOfLines={2}>{entry.native}</Text> : null}
                <View style={st.cardActions}>
                  <TouchableOpacity onPress={() => toggleStar(entry.id)}>
                    <Text style={{ fontSize: 16 }}>{starred ? '⭐' : '☆'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleRestore(entry)}>
                    <Text style={st.actionText}>Restore</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => Clipboard.setStringAsync(entry.text)}>
                    <Text style={st.actionText}>Copy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteHistory(i)}>
                    <Text style={[st.actionText, { color: COLORS.redSoft }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.ink },
  headerSub: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  hamburger: { paddingRight: 12, paddingVertical: 4 },
  hamburgerText: { fontSize: 24, color: COLORS.ink },
  filterBtn: { backgroundColor: COLORS.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.border },
  filterBtnActive: { backgroundColor: COLORS.saffronLight, borderColor: COLORS.borderAccent },
  filterBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.warm },
  searchWrap: { paddingHorizontal: 20, paddingTop: 12 },
  searchInput: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, fontSize: 14, color: COLORS.ink, borderWidth: 1, borderColor: COLORS.border },
  list: { paddingHorizontal: 20, paddingTop: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.warm },
  emptySubtext: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  card: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  langPill: { backgroundColor: COLORS.saffronLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  langPillText: { fontSize: 11, fontWeight: '700', color: COLORS.saffronHover },
  confBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  confText: { fontSize: 11, fontWeight: '700' },
  dateText: { fontSize: 11, color: COLORS.faded, marginLeft: 'auto' },
  previewText: { fontSize: 14, color: COLORS.ink, lineHeight: 20, marginBottom: 4 },
  nativePreview: { fontSize: 12, color: COLORS.muted, fontStyle: 'italic', marginBottom: 8 },
  cardActions: { flexDirection: 'row', gap: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border, alignItems: 'center' },
  actionText: { fontSize: 13, fontWeight: '600', color: COLORS.saffron },
});
