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
  isPremium: boolean;
  login: (account: string, type: "phone" | "email") => void;
  register: (account: string, type: "phone" | "email") => void;
  logout: () => void;
  // Mentor unlock management
  unlockedMentors: string[];
  unlockMentor: (mentorId: string) => void;
  isMentorUnlocked: (mentorId: string) => boolean;
  // Premium membership
  upgradeToPremium: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "acc_user";
const UNLOCK_KEY = "acc_unlocked_mentors";
const PREMIUM_KEY = "acc_premium";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [unlockedMentors, setUnlockedMentors] = useState<string[]>([]);
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setUser(JSON.parse(saved));
      }
      const savedUnlocks = localStorage.getItem(UNLOCK_KEY);
      if (savedUnlocks) {
        setUnlockedMentors(JSON.parse(savedUnlocks));
      }
      const savedPremium = localStorage.getItem(PREMIUM_KEY);
      if (savedPremium === "true") {
        setIsPremium(true);
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
    setIsPremium(false);
    setUnlockedMentors([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(PREMIUM_KEY);
      localStorage.removeItem(UNLOCK_KEY);
    } catch {
      // ignore
    }
  }, []);

  const unlockMentor = useCallback((mentorId: string) => {
    setUnlockedMentors((prev) => {
      if (prev.includes(mentorId)) return prev;
      const updated = [...prev, mentorId];
      try {
        localStorage.setItem(UNLOCK_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  }, []);

  const isMentorUnlocked = useCallback(
    (mentorId: string) => unlockedMentors.includes(mentorId),
    [unlockedMentors]
  );

  const upgradeToPremium = useCallback(() => {
    setIsPremium(true);
    try {
      localStorage.setItem(PREMIUM_KEY, "true");
    } catch {
      // ignore
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: hydrated && !!user,
        isPremium,
        login,
        register,
        logout,
        unlockedMentors,
        unlockMentor,
        isMentorUnlocked,
        upgradeToPremium,
      }}
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
