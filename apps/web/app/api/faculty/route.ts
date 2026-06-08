import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import pino from 'pino';
import { recordAuditLog } from '@/lib/audit';

const baseLogger = pino({ name: 'api-faculty' });

export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || `cor_fallback_${Date.now()}`;
  const logger = baseLogger.child({ correlationId });

  try {
    // 1. Verify User Auth and Role
    const supabaseUserClient = await createClient();
    const { data: { user }, error: authUserError } = await supabaseUserClient.auth.getUser();

    if (authUserError || !user) {
      logger.warn('Unauthorized request to create faculty: No active session');
      return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
    }

    const { data: profile, error: profileErr } = await supabaseUserClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileErr || !profile || profile.role !== 'admin') {
      logger.warn({ userId: user.id, role: profile?.role }, 'Forbidden request to create faculty: User is not an admin');
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // 2. Parse request body
    const body = await request.json();
    const { email, full_name, role, department_id, password } = body;

    logger.info({ email, full_name, role, department_id }, 'Received request to create new faculty user');

    if (!email || !full_name || !role) {
      logger.warn('Missing required fields (email, full_name, role)');
      return NextResponse.json({ error: 'email, full_name, and role are required' }, { status: 400 });
    }

    // 3. Create service role client to talk to Auth Admin API
    const adminSupabase = createServiceRoleClient();

    // 4. Create user in auth
    const { data: authData, error: createAuthError } = await adminSupabase.auth.admin.createUser({
      email,
      password: password || 'faculty123',
      email_confirm: true,
      user_metadata: { role, full_name, department_id }
    });

    if (createAuthError || !authData.user) {
      logger.error({ error: createAuthError?.message }, 'Failed to create auth user');
      return NextResponse.json({ error: createAuthError?.message || 'Failed to create auth user' }, { status: 400 });
    }

    const newUserId = authData.user.id;
    logger.info({ newUserId }, 'Created auth user successfully');

    // 5. Upsert profile record
    const { data: newProfile, error: createProfileError } = await adminSupabase
      .from('profiles')
      .upsert({
        id: newUserId,
        email,
        full_name,
        role,
        department_id: department_id || null,
      }, { onConflict: 'id' })
      .select()
      .single();

    if (createProfileError) {
      logger.error({ error: createProfileError.message, newUserId }, 'Failed to upsert profile record');
      return NextResponse.json({ error: `Auth user created but profile insertion failed: ${createProfileError.message}` }, { status: 500 });
    }

    logger.info({ newUserId }, 'Faculty profile upserted successfully');

    // 6. Record Audit Log
    await recordAuditLog({
      action: 'CREATE_FACULTY',
      entityType: 'profiles',
      entityId: newUserId,
      payload: { email, role, department_id },
      correlationId,
    });

    return NextResponse.json({ success: true, user: newProfile, correlationId });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to create faculty');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
