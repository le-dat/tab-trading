import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class SocketService {
  private server: Server | null = null;

  setServer(server: Server) {
    this.server = server;
  }

  emitToUser(userId: string, event: string, data: any) {
    if (this.server) {
      this.server.to(`user:${userId}`).emit(event, data);
    }
  }

  emitPrice(asset: string, value: string) {
    if (this.server) {
      this.server.emit(`price:${asset}`, { value, updatedAt: Date.now() });
    }
  }

  emitOrderWon(userId: string, orderId: string, payout: string) {
    this.emitToUser(userId, 'order:won', { orderId, payout });
  }

  emitOrderLost(userId: string, orderId: string) {
    this.emitToUser(userId, 'order:lost', { orderId });
  }
}
