import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('finsight_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMe = async () => {
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }
      if (user) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.get('/auth/me');
        if (res.data?.success) {
          setUser(res.data.data);
        } else {
          setToken(null);
          setUser(null);
          localStorage.removeItem('finsight_token');
        }
      } catch {
        setToken(null);
        setUser(null);
        localStorage.removeItem('finsight_token');
      } finally {
        setLoading(false);
      }
    };
    fetchMe();
  }, [token, user]);

  const login = (authToken, userData) => {
    localStorage.setItem('finsight_token', authToken);
    setToken(authToken);
    setUser(userData);
    setLoading(false);
  };

  const logout = () => {
    localStorage.removeItem('finsight_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuthContext = () => useContext(AuthContext);

