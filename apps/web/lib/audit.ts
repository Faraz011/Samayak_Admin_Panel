import { createClient } from './supabase/server';
import pino from 'pino';

const logger = pino({ name: 'audit-service' });

export interface AuditLogParams {
  action: string;
  entityType: string;
  entityId?: string;
  correlationId?: string;
  payload?: any;
}

export async function recordAuditLog(params: AuditLogParams) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const auditData = {
      actor_id: user?.id || null,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId || null,
      correlation_id: params.correlationId || null,
      payload: params.payload || {},
    };

    const { error } = await supabase
      .from('audit_logs')
      .insert(auditData);

    if (error) {
      logger.error({ error: error.message, auditData }, 'Failed to insert audit log in database');
    } else {
      logger.info({ action: params.action, correlationId: params.correlationId }, 'Audit log recorded successfully');
    }
  } catch (err: any) {
    logger.error({ error: err.message, params }, 'Error recording audit log');
  }
}
