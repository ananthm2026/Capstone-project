import { createContext, useContext, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  Image,
} from 'react-native';
import { Slot, useRouter, usePathname } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../src/constants/colors';
import { DrawerContext } from '../../src/context/DrawerContext';
import FloatingAssistant from '../../src/components/FloatingAssistant';

const DRAWER_WIDTH = 300;

const MENU_SECTIONS = [
  {
    title: null,
    items: [
      { name: 'index', label: 'Home', icon: '🏠', route: '/(drawer)' },
    ],
  },
  {
    title: 'Translation',
    items: [
      { name: 'native-to-english', label: 'Speech to Text', icon: '🎙️', route: '/(drawer)/native-to-english' },
      { name: 'continuous', label: 'Continuous Listening', icon: '👂', route: '/(drawer)/continuous' },
      { name: 'english-to-native', label: 'English to Native', icon: '🌐', route: '/english-to-native' },
      { name: 'vision', label: 'Vision Translate', icon: '📷', route: '/vision' },
      { name: 'video', label: 'Video Translate', icon: '🎬', route: '/video' },
    ],
  },
  {
    title: 'Account',
    items: [
      { name: 'history', label: 'History', icon: '🕐', route: '/(drawer)/history' },
      { name: 'profile', label: 'Profile', icon: '👤', route: '/(drawer)/profile' },
      { name: 'settings', label: 'Settings', icon: '⚙️', route: '/(drawer)/settings' },
    ],
  },
];

function CustomDrawerContent({ closeDrawer }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useUser();
  const insets = useSafeAreaInsets();

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(' ') || 'User'
    : 'User';
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  function isActive(item) {
    if (item.name === 'index') return pathname === '/' || pathname === '/(drawer)';
    return pathname.includes(item.name);
  }

  return (
    <View style={[ds.container, { paddingTop: insets.top }]}>
      {/* User header */}
      <View style={ds.header}>
        <View style={ds.avatar}>
          <Text style={ds.avatarText}>{initials}</Text>
        </View>
        <View style={ds.headerInfo}>
          <Text style={ds.userName}>{displayName}</Text>
          <Text style={ds.appLabel}>SeedlingSpeaks</Text>
        </View>
      </View>

      <View style={ds.divider} />

      {/* Menu items */}
      <ScrollView
        style={ds.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      >
        {MENU_SECTIONS.map((section, si) => (
          <View key={si}>
            {section.title && (
              <Text style={ds.sectionTitle}>{section.title}</Text>
            )}
            {section.items.map((item) => {
              const active = isActive(item);
              return (
                <TouchableOpacity
                  key={item.name}
                  style={[ds.menuItem, active && ds.menuItemActive]}
                  activeOpacity={0.7}
                  onPress={() => {
                    closeDrawer();
                    setTimeout(() => router.push(item.route), 200);
                  }}
                >
                  <Text style={ds.menuIcon}>{item.icon}</Text>
                  <Text style={[ds.menuLabel, active && ds.menuLabelActive]}>
                    {item.label}
                  </Text>
                  {active && <View style={ds.activeIndicator} />}
                </TouchableOpacity>
              );
            })}
            {si < MENU_SECTIONS.length - 1 && (
              <View style={ds.sectionDivider} />
            )}
          </View>
        ))}
        <Text style={ds.version}>v2.5 · Built by Seedlinglabs</Text>
      </ScrollView>
    </View>
  );
}

export default function DrawerLayout() {
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const [isOpen, setIsOpen] = useState(false);

  function openDrawer() {
    setIsOpen(true);
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 12,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }

  function closeDrawer() {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: -DRAWER_WIDTH,
        useNativeDriver: true,
        tension: 60,
        friction: 12,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => setIsOpen(false));
  }

  return (
    <DrawerContext.Provider value={{ openDrawer, closeDrawer }}>
      <View style={{ flex: 1 }}>
        {/* Main screen content */}
        <Slot />

        {/* Floating Assistant Widget */}
        <FloatingAssistant />

        {/* Dark overlay */}
        {isOpen && (
          <Animated.View
            style={[ds.overlay, { opacity: overlayOpacity }]}
            pointerEvents={isOpen ? 'auto' : 'none'}
          >
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={closeDrawer}
            />
          </Animated.View>
        )}

        {/* Sliding drawer panel */}
        <Animated.View
          style={[ds.drawer, { transform: [{ translateX }] }]}
          pointerEvents={isOpen ? 'auto' : 'none'}
        >
          <CustomDrawerContent closeDrawer={closeDrawer} />
        </Animated.View>
      </View>
    </DrawerContext.Provider>
  );
}

const ds = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 10,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    zIndex: 11,
    backgroundColor: COLORS.bg,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 20,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.saffronLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.saffron,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.saffron,
  },
  headerInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.ink,
  },
  appLabel: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 20,
  },
  scroll: {
    flex: 1,
    paddingTop: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.faded,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 24,
    marginHorizontal: 10,
    borderRadius: 12,
    gap: 14,
  },
  menuItemActive: {
    backgroundColor: COLORS.saffronLight,
  },
  menuIcon: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.warm,
    flex: 1,
  },
  menuLabelActive: {
    fontWeight: '700',
    color: COLORS.saffronHover,
  },
  activeIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.saffron,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 24,
    marginTop: 8,
    marginBottom: 4,
  },
  version: {
    textAlign: 'center',
    fontSize: 11,
    color: COLORS.faded,
    marginTop: 24,
  },
});
