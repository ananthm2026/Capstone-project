import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDrawer } from '../../src/context/DrawerContext';
import { COLORS } from '../../src/constants/colors';
import * as WebBrowser from 'expo-web-browser';

const HUB_APPS = [
  { id: 'whatsapp', name: 'WhatsApp', icon: '💬', url: 'https://web.whatsapp.com', color: '#25D366' },
  { id: 'slack', name: 'Slack', icon: '#️⃣', url: 'https://slack.com/signin', color: '#4A154B' },
  { id: 'linkedin', name: 'LinkedIn', icon: '💼', url: 'https://www.linkedin.com', color: '#0077B5' },
  { id: 'gmail', name: 'Gmail', icon: '✉️', url: 'https://mail.google.com', color: '#EA4335' },
];

export default function SocialHubScreen() {
  const insets = useSafeAreaInsets();
  const { openDrawer } = useDrawer();

  async function openApp(url) {
    // In a real production app with react-native-webview, 
    // we would load this in a full-screen view inside the app.
    // For Expo Go, we use the WebBrowser which is the most stable way.
    await WebBrowser.openBrowserAsync(url, {
      toolbarColor: COLORS.ink,
      enableBarCollapsing: true,
      showTitle: true,
    });
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={openDrawer} style={styles.hamburger}>
          <Text style={styles.hamburgerText}>☰</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Social Hub</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>The "Floating" Solution</Text>
          <Text style={styles.infoText}>
            To use the widget over WhatsApp on iPhone, use this Hub to open your web accounts. 
            {"\n\n"}
            The <Text style={{fontWeight:'700'}}>Smart Assistant 🌱</Text> will stay active so you can record, translate, and copy while you chat.
          </Text>
        </View>

        <View style={styles.grid}>
          {HUB_APPS.map((app) => (
            <TouchableOpacity 
              key={app.id} 
              style={styles.appCard} 
              onPress={() => openApp(app.url)}
            >
              <View style={[styles.iconCircle, { backgroundColor: app.color + '15' }]}>
                <Text style={styles.appIcon}>{app.icon}</Text>
              </View>
              <Text style={styles.appName}>{app.name}</Text>
              <Text style={styles.appAction}>Open Web View</Text>
            </TouchableOpacity>
          ))}
        </View>
        
        <View style={styles.warningCard}>
          <Text style={styles.warningText}>
            ⚠️ <Text style={{fontWeight:'700'}}>Note:</Text> Apple prevents the bubble from appearing inside the standalone WhatsApp app. Use this Hub for the best "Widget" experience.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  hamburger: { paddingRight: 12, paddingVertical: 4 },
  hamburgerText: { fontSize: 24, color: COLORS.ink },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.ink },
  content: { flex: 1, padding: 20 },
  infoCard: {
    backgroundColor: COLORS.ink,
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
  },
  infoTitle: { fontSize: 18, fontWeight: '800', color: '#FFF', marginBottom: 8 },
  infoText: { fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 22 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  appCard: {
    width: '47%',
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 2,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  appIcon: { fontSize: 30 },
  appName: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  appAction: { fontSize: 11, color: COLORS.muted, marginTop: 4 },
  warningCard: {
    marginTop: 'auto',
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  warningText: { fontSize: 12, color: COLORS.warm, lineHeight: 18, textAlign: 'center' },
});
