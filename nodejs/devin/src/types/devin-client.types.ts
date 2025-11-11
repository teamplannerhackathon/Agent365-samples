export interface DevinCreateSessionResponse {
  session_id?: string;
}

export interface DevinSessionResponse {
  status: DevinSessionStatus;
  messages?: { type: string; message?: string; event_id: string }[];
}

export enum DevinSessionStatus {
  new = "new",
  claimed = "claimed",
  running = "running",
}
