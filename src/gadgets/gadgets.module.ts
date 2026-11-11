import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GadgetEntity } from './entities/gadget.entity';
import { GadgetsController } from './gadgets.controller';
import { GadgetsService } from './gadgets.service';

@Module({
  imports: [TypeOrmModule.forFeature([GadgetEntity])],
  providers: [GadgetsService],
  controllers: [GadgetsController],
})
export class GadgetsModule {}
