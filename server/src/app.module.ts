import { Global, Module, type DynamicModule } from '@nestjs/common'
import { APP_CONFIG, type AppConfig } from './config/app.config.js'
import { GameModule } from './game/game.module.js'

@Global()
@Module({})
class ConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return { module: ConfigModule, providers: [{ provide: APP_CONFIG, useValue: config }], exports: [APP_CONFIG] }
  }
}

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return { module: AppModule, imports: [ConfigModule.forRoot(config), GameModule] }
  }
}
