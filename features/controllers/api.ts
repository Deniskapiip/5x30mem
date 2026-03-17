import { supabase } from '@/lib/supabase';
import type { Controller, ControllerInsert } from '@/types/controller';

const TABLE = 'controllers';

export async function listControllers(): Promise<Controller[]> {
  const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data as Controller[]) ?? [];
}

export async function createController(payload: ControllerInsert): Promise<Controller> {
  const { data, error } = await supabase.from(TABLE).insert(payload).select('*').single();

  if (error || !data) {
    throw error ?? new Error('Could not create controller');
  }

  return data as Controller;
}

export function subscribeToControllers(onChange: () => void) {
  const channel = supabase
    .channel('controllers-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => {
      onChange();
    })
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
