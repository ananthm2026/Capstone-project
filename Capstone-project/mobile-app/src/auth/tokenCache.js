import * as SecureStore from 'expo-secure-store';

export const tokenCache = {
  async getToken(key) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async saveToken(key, value) {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Silently fail — worst case user has to re-login
    }
  },
  async clearToken(key) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Silently fail
    }
  },
};
