// What the messages API returns (D-173).
export interface CarCard { stockId: string; name: string; category: string | null; kind: string | null; askingPriceUgx: number; photoId: string | null; inStock: boolean }
export interface ConversationItem {
  conversationId: string; kind: 'team' | 'broker' | 'direct'; organisationId: string; title: string; unread: number;
  /** A private chat (D-177): the other person's role. */
  role?: string;
  last: { body: string; hasCar: boolean; sender: string; at: string } | null;
}
export interface ThreadMessage { id: string; mine: boolean; sender: { name: string; role: string }; body: string; car: CarCard | null; createdAt: string; seen: boolean }
export interface Thread {
  conversationId: string | null; kind: 'team' | 'broker' | 'direct'; organisationId: string; title: string;
  /** A private chat (D-177): the other person's role, and closed once they have left the team. */
  role?: string; closed?: boolean;
  members: { userId: string; name: string; role: string; you: boolean }[];
  /** Everyone in the chat, for its details. */
  people: { userId: string; name: string; role: string; you: boolean }[];
  messages: ThreadMessage[]; seenBy: { name: string; you: boolean }[];
}
/** A car the writer may put in a message. */
export interface CarOption { stockId: string; name: string; detail: string; photoUrl: string | null; plate?: string | null }
/** New chat (D-177): the other members of the team. */
export interface TeamPerson { userId: string; name: string; role: string; conversationId: string | null }
