// Client-side auth helper for Better Auth
const Auth = {
  // Sign up with email/password
  async signUp({ name, email, password }) {
    const res = await fetch('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Registration failed');
    return data;
  },

  // Sign in with email/password
  async signIn({ email, password }) {
    const res = await fetch('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Invalid email or password');
    return data;
  },

  // Sign out
  async signOut() {
    await fetch('/api/auth/sign-out', {
      method: 'POST',
      credentials: 'include',
    });
  },

  // Get current session
  async getSession() {
    try {
      const res = await fetch('/api/auth/get-session', {
        credentials: 'include',
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data;
    } catch {
      return null;
    }
  },

  // Redirect to login if not authenticated
  async requireAuth() {
    const session = await this.getSession();
    if (!session || !session.user) {
      window.location.href = '/login.html';
      return null;
    }
    return session;
  },

  // Redirect to dashboard if already authenticated
  async redirectIfAuth() {
    const session = await this.getSession();
    if (session && session.user) {
      window.location.href = '/dashboard.html';
      return true;
    }
    return false;
  },
};
