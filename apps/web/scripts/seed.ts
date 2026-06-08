// @ts-ignore
import { loadEnvConfig } from '@next/env';
import path from 'path';

// Load environment variables from .env.local
loadEnvConfig(path.resolve(__dirname, '..'));

// Shim WebSocket for Node < 22 to prevent Supabase Realtime client error
if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as any).WebSocket = class {};
}

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://urgtpxnrutgeiyuxkawx.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_USERS = [
  { email: 'admin@samayak.demo', password: 'admin123', full_name: 'Dr. Admin User', role: 'admin' },
  { email: 'dean@samayak.demo', password: 'dean123', full_name: 'Prof. Dean Sharma', role: 'dean' },
  { email: 'hod@samayak.demo', password: 'hod123', full_name: 'Dr. HoD Verma', role: 'hod' },
  { email: 'coordinator@samayak.demo', password: 'coord123', full_name: 'Dr. Coord Patel', role: 'coordinator' },
  { email: 'professor@samayak.demo', password: 'professor123', full_name: 'Prof. Faculty Singh', role: 'professor' },
] as const;

async function seed() {
  console.log('🌱 Seeding Samayak Admin Panel…\n');

  // Get CSE department ID
  const { data: cseDept } = await supabase
    .from('departments')
    .select('id')
    .eq('short_code', 'CSE')
    .single();

  const departmentId = cseDept?.id || null;

  for (const user of DEMO_USERS) {
    console.log(`  Creating ${user.role}: ${user.email}…`);

    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existing = existingUsers?.users?.find((u) => u.email === user.email);

    let userId: string;

    if (existing) {
      console.log(`    → Already exists (${existing.id})`);
      userId = existing.id;
    } else {
      // Create auth user
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
      });

      if (authError) {
        console.error(`    ✗ Auth error: ${authError.message}`);
        continue;
      }

      userId = authUser.user.id;
      console.log(`    → Auth user created (${userId})`);
    }

    // Upsert profile
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userId,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      department_id: departmentId,
    }, { onConflict: 'id' });

    if (profileError) {
      console.error(`    ✗ Profile error: ${profileError.message}`);
    } else {
      console.log(`    ✓ Profile upserted`);
    }
  }

  // Also create some additional faculty for fuzzy matching testing
  const additionalFaculty = [
    { email: 'sharma.r@samayak.demo', password: 'faculty123', full_name: 'Dr. Rakesh Sharma', role: 'professor' },
    { email: 'kumar.a@samayak.demo', password: 'faculty123', full_name: 'Prof. Amit Kumar', role: 'professor' },
    { email: 'gupta.s@samayak.demo', password: 'faculty123', full_name: 'Dr. Sanjay Gupta', role: 'professor' },
    { email: 'singh.m@samayak.demo', password: 'faculty123', full_name: 'Prof. Meera Singh', role: 'professor' },
    { email: 'patel.v@samayak.demo', password: 'faculty123', full_name: 'Dr. Vijay Patel', role: 'professor' },
  ];

  console.log('\n  Creating additional faculty…');
  for (const fac of additionalFaculty) {
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existing = existingUsers?.users?.find((u) => u.email === fac.email);

    let userId: string;
    if (existing) {
      userId = existing.id;
    } else {
      const { data: authUser, error } = await supabase.auth.admin.createUser({
        email: fac.email,
        password: fac.password,
        email_confirm: true,
      });
      if (error) { console.error(`    ✗ ${fac.email}: ${error.message}`); continue; }
      userId = authUser.user.id;
    }

    await supabase.from('profiles').upsert({
      id: userId,
      email: fac.email,
      full_name: fac.full_name,
      role: fac.role,
      department_id: departmentId,
    }, { onConflict: 'id' });

    console.log(`    ✓ ${fac.full_name}`);
  }

  console.log('\n✅ Seeding complete!\n');
  console.log('Demo login credentials:');
  DEMO_USERS.forEach((u) => {
    console.log(`  ${u.role.padEnd(12)} → ${u.email} / ${u.password}`);
  });
}

seed().catch(console.error);
