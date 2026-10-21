import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { networkInterfaces } from 'node:os'
import { AppModule } from './app.module.js'
import { loadConfig } from './config/app.config.js'

async function bootstrap(): Promise<void> {
  const config = loadConfig()
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), { bufferLogs: false })
  app.disable('x-powered-by')
  app.enableCors({ origin: true })
  app.enableShutdownHooks()
  await app.listen(config.port, config.host)

  const logger = new Logger('Bootstrap')
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => `http://${n!.address}:${config.port}`)
  logger.log(`Sunucu ${config.port} portunda. Veri: ${config.dataDir}`)
  if (lan.length > 0) logger.log(`Yerel ağ: ${lan.join(', ')}`)
}

await bootstrap()
