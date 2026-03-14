import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('sr5_token');
    if (token) {
      api.getProfile()
        .then(userData => setUser(userData))
        .catch(() => {
          localStorage.removeItem('sr5_token');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const data = await api.login({ email, password });
    localStorage.setItem('sr5_token', data.token);
    setUser(data.user);
    return data;
  };

  const register = async (formData) => {
    const data = await api.register(formData);
    if (data.token && data.user) {
      localStorage.setItem('sr5_token', data.token);
      setUser(data.user);
    }
    return data;
  };

  const verifyEmail = async (email, code) => {
    const data = await api.verifyEmailCode({ email, code });
    if (data.token && data.user) {
      localStorage.setItem('sr5_token', data.token);
      setUser(data.user);
    }
    return data;
  };

  const resendVerificationCode = async (email) => {
    const data = await api.resendVerificationCode({ email });
    return data;
  };

  const logout = () => {
    localStorage.removeItem('sr5_token');
    setUser(null);
  };

  const updateUser = (userData) => {
    setUser(prev => ({ ...prev, ...userData }));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, verifyEmail, resendVerificationCode, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
