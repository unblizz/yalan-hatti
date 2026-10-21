import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import express from 'express'
import { APP_CONFIG, type AppConfig } from '../config/app.config.js'
import { RoomStore } from './persistence/room-store.js'
import { CLOCK, RoomService } from './room.service.js'
import { GameGateway } from './transport/game.gateway.js'
import { RoomsController } from './transport/rooms.controller.js'

@Module({
  controllers: [RoomsController],
  providers: [
    { provide: CLOCK, useValue: () => Date.now() },
    { provide: RoomStore, inject: [APP_CONFIG], useFactory: (config: AppConfig) => new RoomStore(config.dataDir) },
    RoomService,
    GameGateway,
  ],
})
export class GameModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(express.raw({ type: () => true, limit: '80mb' })).forRoutes('rooms/:code/calls/:callId/recording')
  }
}
