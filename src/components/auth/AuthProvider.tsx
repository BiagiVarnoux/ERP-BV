import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type MfaState = 'checking' | 'idle' | 'required' | 'verified';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  mfaState: MfaState;
  mfaVerified: () => void;
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, invitationCode?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}

async function checkMfaRequired(): Promise<MfaState> {
  try {
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!aalData) return 'idle';
    if (aalData.currentLevel === 'aal2') return 'verified';
    if (aalData.nextLevel === 'aal2') return 'required';
    return 'idle';
  } catch {
    return 'idle';
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // Start as 'checking' so the app never renders routes before MFA is resolved
  const [mfaState, setMfaState] = useState<MfaState>('checking');
  // True when the user arrives via a password-reset email link.
  // While true, the app renders the ResetPasswordForm instead of the main ERP.
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) { setLoading(false); setMfaState('idle'); return; }

    // ── Auth state listener — SYNCHRONOUS, no async/await here ──────────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // These are synchronous state updates — safe inside onAuthStateChange
        setUser(session?.user ?? null);
        setLoading(false);

        if (!session?.user) {
          setMfaState('idle');
          setIsPasswordRecovery(false);
          return;
        }

        // PASSWORD_RECOVERY: user clicked the reset-password email link.
        // Flag the app to show the ResetPasswordForm instead of the main ERP.
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true);
          return;
        }

        // Handle invitation code on SIGNED_IN (use setTimeout to avoid
        // calling Supabase inside the onAuthStateChange callback)
        if (event === 'SIGNED_IN') {
          const urlParams = new URLSearchParams(window.location.search);
          const pendingCode = urlParams.get('invitation_code');

          if (pendingCode) {
            urlParams.delete('invitation_code');
            const newUrl = urlParams.toString()
              ? `${window.location.pathname}?${urlParams}`
              : window.location.pathname;
            window.history.replaceState({}, '', newUrl);

            setTimeout(async () => {
              try {
                const { data } = await supabase.rpc('redeem_invitation_code', {
                  _code: pendingCode,
                  _user_id: session.user.id,
                });
                const result = data as Record<string, unknown> | null;
                if (result?.success) window.location.reload();
                else console.error('Failed to redeem code:', (result as any)?.error);
              } catch (error) {
                console.error('Error redeeming invitation code:', error);
              }
            }, 0);
          } else {
            // Sin código de invitación: si el usuario no tiene empresa,
            // UserAccessContext detecta needsOnboarding=true y muestra
            // CreateCompanyForm para que cree su propia empresa.
          }
        }
      }
    );

    // Bootstrap: get existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── MFA check — separate effect, runs only when user identity changes ─────
  // Keeping this out of onAuthStateChange avoids async race conditions.
  useEffect(() => {
    if (!user) {
      setMfaState('idle');
      return;
    }
    setMfaState('checking');
    checkMfaRequired().then(setMfaState);
  }, [user?.id]);

  function mfaVerified() {
    setMfaState('verified');
  }

  function clearPasswordRecovery() {
    setIsPasswordRecovery(false);
  }

  const signIn = async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase no disponible');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, invitationCode?: string) => {
    if (!supabase) throw new Error('Supabase no disponible');
    const redirectTo = invitationCode
      ? `${window.location.origin}/?invitation_code=${encodeURIComponent(invitationCode)}`
      : `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setMfaState('idle');
  };

  return (
    <AuthContext.Provider value={{ user, loading, mfaState, mfaVerified, isPasswordRecovery, clearPasswordRecovery, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
