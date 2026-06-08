'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Mail, Lock, LogIn, GraduationCap, ChevronRight } from 'lucide-react';
import { DEMO_ACCOUNTS } from '@samayak/shared';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (loginEmail: string, loginPassword: string) => {
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleLogin(email, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-[480px] animate-fade-in">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-[14px] bg-gradient-brand flex items-center justify-center shadow-lg">
              <GraduationCap className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-[28px] font-extrabold tracking-tight text-ink">
              Samayak
            </h1>
          </div>
          <p className="text-muted font-medium text-[15px]">
            Academic Operations Platform
          </p>
        </div>

        {/* Login Card */}
        <Card className="mb-6">
          <CardContent className="p-8">
            <form onSubmit={handleSubmit} className="space-y-5" id="login-form">
              <div>
                <label htmlFor="email-input" className="text-[13px] font-bold text-ink block mb-2">
                  Email Address
                </label>
                <Input
                  id="email-input"
                  type="email"
                  placeholder="admin@samayak.demo"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  icon={<Mail className="w-[18px] h-[18px]" />}
                  error={!!error}
                  required
                />
              </div>

              <div>
                <label htmlFor="password-input" className="text-[13px] font-bold text-ink block mb-2">
                  Password
                </label>
                <Input
                  id="password-input"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  icon={<Lock className="w-[18px] h-[18px]" />}
                  error={!!error}
                  required
                />
              </div>

              {error && (
                <div className="bg-[#fdecee] text-error text-[13px] font-semibold px-4 py-2.5 rounded-[10px]">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={loading}
                id="login-button"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <LogIn className="w-[17px] h-[17px]" />
                    Sign In
                  </span>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Demo Credentials */}
        <Card>
          <CardContent className="p-5">
            <p className="text-[11.5px] font-extrabold uppercase tracking-[0.14em] text-muted mb-3">
              Demo Credentials
            </p>
            <div className="space-y-1.5">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  id={`demo-${account.role}`}
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(account.password);
                    handleLogin(account.email, account.password);
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-[12px] text-left transition-all duration-150 hover:bg-[#f1f7ff] group"
                >
                  <span
                    className="w-8 h-8 rounded-[10px] flex items-center justify-center text-white text-[12px] font-extrabold flex-shrink-0"
                    style={{
                      background:
                        account.role === 'admin'
                          ? 'linear-gradient(105deg, #256199, #3DA1FF)'
                          : account.role === 'dean'
                          ? '#4f46e5'
                          : account.role === 'hod'
                          ? '#7c3aed'
                          : account.role === 'coordinator'
                          ? '#0d9488'
                          : '#64748b',
                    }}
                  >
                    {account.role[0].toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold text-ink-soft truncate">
                      {account.email}
                    </p>
                    <p className="text-[11.5px] text-muted font-medium capitalize">
                      {account.role} · {account.password}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-[12.5px] text-muted font-medium mt-6">
          Built for Anugat AI · BIT Mesra CSE Spring 2026
        </p>
      </div>
    </div>
  );
}
