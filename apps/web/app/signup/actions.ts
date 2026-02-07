'use server';

import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';

export async function signup(formData: FormData) {
  const supabase = await createClient();
  const headersList = await headers();
  const origin = headersList.get('origin') || '';

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters.' };
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/confirm`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: 'Check your email for a confirmation link to complete your registration.' };
}
