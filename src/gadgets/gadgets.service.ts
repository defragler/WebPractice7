import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsOrder, FindOptionsWhere, ILike, Repository } from 'typeorm';
import { CreateGadgetDto } from './dto/create-gadget.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { UpdateGadgetDto } from './dto/update-gadget.dto';
import { GadgetEntity } from './entities/gadget.entity';

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@Injectable()
export class GadgetsService {
  constructor(
    @InjectRepository(GadgetEntity)
    private readonly gadgetRepo: Repository<GadgetEntity>,
  ) {}

  async create(dto: CreateGadgetDto): Promise<GadgetEntity> {
    const gadget = this.gadgetRepo.create(dto);
    return await this.gadgetRepo.save(gadget);
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<GadgetEntity>> {
    const { page, limit, search, sortBy, order } = query;

    const where: FindOptionsWhere<GadgetEntity> = {};
    if (search && search.trim() !== '') {
      where.title = ILike(`%${escapeLike(search.trim())}%`);
    }

    const orderBy = { [sortBy]: order, id: 'ASC' } as FindOptionsOrder<GadgetEntity>;

    const [data, total] = await this.gadgetRepo.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: orderBy,
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<GadgetEntity> {
    const gadget = await this.gadgetRepo.findOneBy({ id });
    if (!gadget) {
      throw new NotFoundException(`Сутність з ID ${id} не знайдена`);
    }
    return gadget;
  }

  async update(id: string, dto: UpdateGadgetDto): Promise<GadgetEntity> {
    const gadget = await this.findOne(id);
    Object.assign(gadget, dto);
    return await this.gadgetRepo.save(gadget);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.gadgetRepo.softDelete(id);
  }

  async restore(id: string): Promise<{ message: string }> {
    const deleted = await this.gadgetRepo.findOne({
      where: { id },
      withDeleted: true,
    });
    if (!deleted) {
      throw new NotFoundException(`Сутність з ID ${id} не знайдена`);
    }
    if (deleted.deletedAt === null) {
      return { message: 'Сутність не була видалена' };
    }
    await this.gadgetRepo.restore(id);
    return { message: 'Сутність успішно відновлена' };
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
