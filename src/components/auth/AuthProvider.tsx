import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type MfaState = 'idle' | 'required' | 'verified';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  mfaState: MfaState;
  mfaVerified: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, invitationCode?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: React.ReactNode;
}

/** Check if the current session has already passed MFA (AAL2) or has a pending TOTP factor. */
async function checkMfaRequired(): Promise<MfaState> {
  try {
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!aalData) return 'idle';

    const { currentLevel, nextLevel } = aalData;

    // If the session is already at AAL2, MFA is satisfied
    if (currentLevel === 'aal2') return 'verified';

    // If the user has enrolled TOTP factors but session is only AAL1, require challenge
    if (nextLevel === 'aal2') return 'required';

    return 'idle';
  } catch {
    return 'idle';
  }
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaState, setMfaState] = useState<MfaState>('idle');

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);

        if (session?.user) {
          // Check MFA status on every auth state change
          const mfa = await checkMfaRequired();
          setMfaState(mfa);
        } else {
          setMfaState('idle');
        }

        // When user signs in, check for invitation code in URL
        if (event === 'SIGNED_IN' && session?.user) {
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
                  _user_id: session.user.id
                });

                const result = data as Record<string, unknown> | null;
                if (result?.success) {
                  window.location.reload();
                } else {
                  console.error('Failed to redeem code:', (result as any)?.error);
                }
              } catch (error) {
                console.error('Error redeeming invitation code:', error);
              }
            }, 0);
          } else {
            setTimeout(async () => {
              try {
                await supabase.rpc('assign_default_owner_role', {
                  _user_id: session.user.id
                });
              } catch (error) {
                console.error('Error assigning owner role:', error);
              }
            }, 0);
          }
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        const mfa = await checkMfaRequired();
        setMfaState(mfa);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  function mfaVerified() {
    setMfaState('verified');
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
    <AuthContext.Provider value={{
      user,
      loading,
      mfaState,
      mfaVerified,
      signIn,
      signUp,
      signOut
    }}>
      {children}
    </AuthContext.Provider>
  );
}
