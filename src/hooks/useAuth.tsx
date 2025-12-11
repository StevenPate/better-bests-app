import { useState, useEffect, createContext, useContext } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isPbnStaff: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>; 
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const isTestEnv = import.meta.env.MODE === 'test';

/**
 * Authentication context provider
 *
 * Manages Supabase authentication state, user session, and role-based
 * access control. Provides auth methods (signIn, signUp, signOut) and
 * user metadata including PBN staff status.
 *
 * Features:
 * - Automatic session persistence and recovery
 * - Real-time auth state change listeners
 * - Role-based access (PBN staff detection)
 * - Password reset functionality
 * - Test environment compatibility
 *
 * @param {Object} props - Provider props
 * @param {React.ReactNode} props.children - Child components
 * @returns Provider component with auth context
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <AuthProvider>
 *       <YourApp />
 *     </AuthProvider>
 *   );
 * }
 * ```
 */
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isPbnStaff, setIsPbnStaff] = useState(false);
  const [loading, setLoading] = useState(!isTestEnv);

  useEffect(() => {
    if (isTestEnv) {
      return;
    }

    // Set up auth state listener
    try {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, session) => {
          setSession(session);
          setUser(session?.user ?? null);

          // Check user role when session changes
          if (session?.user) {
            // Defer role check to avoid synchronous state updates during auth callback.
            // setTimeout(..., 0) pushes checkUserRole to the next event loop tick, allowing
            // React 18's automatic batching to complete before triggering additional
            // state changes. Without this, we risk "Cannot update a component while
            // rendering a different component" warnings.
            setTimeout(() => {
              checkUserRole(session.user.id);
            }, 0);
          } else {
            setIsPbnStaff(false);
            setLoading(false); // No role check needed when logged out
          }
        }
      );

      // Check for existing session
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          checkUserRole(session.user.id); // This will set loading to false when done
        } else {
          setLoading(false); // No role check needed when logged out
        }
      });

      return () => subscription.unsubscribe();
    } catch (error) {
      logger.error('Auth initialization error:', error);
      setLoading(false);
      return () => {}; // Return empty cleanup function on error
    }
  }, []);

  const checkUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'pbn_staff')
        .single();

      if (!error && data) {
        setIsPbnStaff(true);
      } else {
        setIsPbnStaff(false);
      }
    } catch (error) {
      setIsPbnStaff(false);
    } finally {
      // Only set loading to false after role check completes
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const requestPasswordReset = async (email: string) => {
    const redirectUrl = `${window.location.origin}/auth`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    return { error };
  };
  return (
    <AuthContext.Provider value={{
      user,
      session,
      isPbnStaff,
      loading,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Custom hook for accessing authentication context
 *
 * Provides access to current user, session, loading state, and auth methods.
 * Must be used within an AuthProvider component tree.
 *
 * @returns Authentication context values
 * @throws {Error} If used outside AuthProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { user, isPbnStaff, signOut } = useAuth();
 *
 *   if (isPbnStaff) {
 *     // Show staff-only features
 *   }
 *
 *   return (
 *     <button onClick={signOut}>
 *       Sign Out {user?.email}
 *     </button>
 *   );
 * }
 * ```
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};