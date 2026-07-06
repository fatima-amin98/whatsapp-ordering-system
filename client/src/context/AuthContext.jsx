import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [merchant, setMerchant] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.me()
      .then((data) => setMerchant(data.store))
      .catch(() => setMerchant(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (slug, password) => {
    const data = await api.login({ slug, password });
    setMerchant(data.store);
    return data;
  }, []);

  const register = useCallback(async (body) => {
    const data = await api.register(body);
    setMerchant(data.store);
    return data;
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setMerchant(null);
  }, []);

  return (
    <AuthContext.Provider value={{ merchant, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
