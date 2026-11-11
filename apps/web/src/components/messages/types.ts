// What the messages API returns (D-173).
export interface CarCard { stockId: string; name: string; category: string | null; kind: string | null; askingPriceUgx: number; photoId: string | null; inStock: boolean }
export interface ConversationItem {
  conversationId: string; kind: 'team' | 'broker'; organisationId: string; title: string; unread: number;
  last: { body: string; hasCar: boolean; sender: string; at: string } | null;
}
export interface ThreadMessage { id: string; mine: boolean; sender: { name: string; role: string }; body: string; car: CarCard | null; createdAt: string; seen: boolean }
export interface Thread {
  conversationId: string | null; kind: 'team' | 'broker'; organisationId: string; title: string;
  members: { userId: string; name: string; role: string }[];
  messages: ThreadMessage[]; seenBy: { name: string; you: boolean }[];
}
/** A car the writer may put in a message. */
export interface CarOption { stockId: string; name: string; detail: string; photoUrl: string | null }
