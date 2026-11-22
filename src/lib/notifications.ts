import { supabase } from "./supabase";

export type NotificationKind =
  | "deadline_yellow"
  | "deadline_red"
  | "hr_reminder";

export type AppNotification = {
  id: string;
  recipient_id: string;
  case_id: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  read_at: string | null;
  created_by: string | null;
  created_at: string;
};

export async function fetchMyNotifications(
  limit = 30,
): Promise<AppNotification[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as AppNotification[];
}

export async function syncDeadlineNotifications(): Promise<number> {
  const { data, error } = await supabase.rpc("sync_deadline_notifications");
  if (error) throw new Error(error.message);
  return typeof data === "number" ? data : Number(data) || 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .is("read_at", null);
  if (error) throw new Error(error.message);
}

export async function hrSendCaseReminder(caseId: string): Promise<string> {
  const { data, error } = await supabase.rpc("hr_send_case_reminder", {
    p_case_id: caseId,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export function unreadCount(items: AppNotification[]): number {
  return items.filter((n) => !n.read_at).length;
}
