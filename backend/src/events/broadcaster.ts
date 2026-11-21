import { WebSocket } from 'ws';

export type DomainEvent =
  | { type: 'requirement.updated'; requirementId: string; version: number; data: unknown }
  | { type: 'comment.created'; requirementId: string; version: number; data: unknown };

/** /events 的已认证客户端集合；仅服务端推送，不回放历史事件。 */
export class EventBroadcaster {
  private readonly clients = new Set<WebSocket>();
  private readonly heartbeat: NodeJS.Timeout;

  constructor() {
    this.heartbeat = setInterval(() => {
      for (const client of this.clients) {
        if (client.readyState === WebSocket.OPEN) client.ping();
      }
    }, 30_000);
    this.heartbeat.unref();
  }

  add(client: WebSocket): void {
    this.clients.add(client);
    client.on('close', () => this.clients.delete(client));
    client.on('error', () => this.clients.delete(client));
  }

  broadcast(event: DomainEvent): void {
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

  get size(): number {
    return this.clients.size;
  }

  close(): void {
    clearInterval(this.heartbeat);
    for (const client of this.clients) client.close(1001, 'server shutdown');
    this.clients.clear();
  }
}
