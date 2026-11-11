import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GadgetsModule } from './gadgets/gadgets.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USERNAME ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'admin',
      database: process.env.DB_NAME ?? 'postgres',
      autoLoadEntities: true,
      synchronize: process.env.NODE_ENV !== 'production',
      logging: ['schema', 'error'],
    }),
    GadgetsModule,
  ],
})
export class AppModule {}
