"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

interface User {
  id: string;
  account: string; // phone or email
  type: "phone" | "email";
}

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  login: (account: string, type: "phone" | "email") => void;
  register: (account: string, type: "phone" | "email") => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "acc_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setUser(JSON.parse(saved));
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  const login = useCallback((account: string, type: "phone" | "email") => {
    const newUser: User = { id: `${type}_${Date.now()}`, account, type };
    setUser(newUser);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
    } catch {
      // ignore
    }
  }, []);

  const register = useCallback((account: string, type: "phone" | "email") => {
    // Same as login for now — registration creates the account
    const newUser: User = { id: `${type}_${Date.now()}`, account, type };
    setUser(newUser);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
    } catch {
      // ignore
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: hydrated && !!user, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
