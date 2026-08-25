import { apiGet, apiPost } from "./client";

export type MessageThread = {
  with_email: string;
  last_at: string | null;
  last_content: string | null;
  unread_count: number;
};

export type DirectMessage = {
  id: string;
  sender_email: string;
  receiver_email: string;
  content: string;
  read: boolean;
  created_at: string;
};

export async function listThreads(token?: string | null): Promise<MessageThread[]> {
  const data = await apiGet<{ threads: MessageThread[] }>("/messages/threads", token);
  return data.threads || [];
}

export async function loadThread(
  withEmail: string,
  token?: string | null
): Promise<DirectMessage[]> {
  const data = await apiGet<{ messages: DirectMessage[] }>(
    `/messages/thread?with=${encodeURIComponent(withEmail)}`,
    token
  );
  return data.messages || [];
}

export async function sendMessage(
  content: string,
  to: string | undefined,
  token?: string | null
): Promise<DirectMessage> {
  const data = await apiPost<{ message: DirectMessage }>(
    "/messages",
    to ? { content, to } : { content },
    token
  );
  return data.message;
}
