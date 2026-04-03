import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SocketService } from './socket.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class SocketGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(private socketService: SocketService) {}

  afterInit() {
    this.socketService.setServer(this.server);
  }

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  @SubscribeMessage('subscribe:prices')
  handleSubscribePrices(client: Socket, assets: string[]) {
    for (const asset of assets) {
      client.join(`price:${asset}`);
    }
    return { event: 'subscribed', assets };
  }

  @SubscribeMessage('subscribe:orders')
  handleSubscribeOrders(client: Socket, userId: string) {
    client.join(`user:${userId}`);
    return { event: 'subscribed', userId };
  }
}
