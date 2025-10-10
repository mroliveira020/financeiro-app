import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import api from "../services/http";
import { clearSession, getAccessToken, getStoredUser, storeSession } from "../services/auth";

const AuthContext = createContext(undefined);

function safeErrorMessage(error) {
  return error?.response?.data?.error || error?.message || "Falha ao autenticar";
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getAccessToken());
  const [user, setUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(!!token);
  const [authError, setAuthError] = useState(null);
  const userRef = useRef(user);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    let ativo = true;
    const shouldBlock = !userRef.current;
    if (shouldBlock) {
      setLoading(true);
    } else {
      setLoading(false);
    }
    setAuthError(null);

    api
      .get("/auth/me")
      .then((response) => {
        if (!ativo) return;
        setUser(response.data);
        storeSession(token, response.data);
      })
      .catch((error) => {
        if (!ativo) return;
        console.error("[auth] Sessão inválida:", error);
        clearSession();
        setToken("");
        setUser(null);
        setAuthError("Sessão expirada. Faça login novamente.");
      })
      .finally(() => {
        if (!ativo) return;
        if (shouldBlock) {
          setLoading(false);
        }
      });

    return () => {
      ativo = false;
    };
  }, [token]);

  useEffect(() => {
    const handleSessionChange = () => {
      setToken(getAccessToken());
      setUser(getStoredUser());
    };

    const handleSessionExpired = () => {
      clearSession();
      setToken("");
      setUser(null);
      setAuthError("Sessão expirada. Faça login novamente.");
    };

    window.addEventListener("auth-session-changed", handleSessionChange);
    window.addEventListener("auth-session-expired", handleSessionExpired);

    return () => {
      window.removeEventListener("auth-session-changed", handleSessionChange);
      window.removeEventListener("auth-session-expired", handleSessionExpired);
    };
  }, []);

  const login = async (email, password) => {
    setAuthError(null);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      storeSession(data.token, data.user);
      setToken(data.token);
      setUser(data.user);
      return data.user;
    } catch (error) {
      const message = safeErrorMessage(error);
      setAuthError(message);
      throw new Error(message);
    }
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (error) {
      console.warn("[auth] Falha ao chamar logout:", error);
    } finally {
      clearSession();
      setToken("");
      setUser(null);
    }
  };

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: !!user && !!token,
      isLoading: loading,
      error: authError,
      login,
      logout,
      clearError: () => setAuthError(null),
      hasRole: (...roles) => {
        if (!user) return false;
        const normalized = roles.length ? roles : ["viewer"];
        return normalized.includes(user.role);
      },
    }),
    [user, token, loading, authError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth deve ser utilizado dentro de AuthProvider");
  }
  return context;
}
