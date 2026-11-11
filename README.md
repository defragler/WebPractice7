# Практична робота № 7

## Тема: Реалізація операцій CRUD засобами TypeORM та PostgreSQL

---

## Мета роботи

- Навчитися інтегрувати реляційну систему керування базами даних PostgreSQL у серверний застосунок на базі NestJS за допомогою Docker Compose.
- Опанувати роботу з об'єктно-реляційним відображенням (Object-Relational Mapping — ORM) через бібліотеку `TypeORM`.
- Навчитися проєктувати та декларувати класи сутностей (`entities`), налаштовувати типи стовпців PostgreSQL, генерувати первинні ключі (`UUID` або автоінкремент) та використовувати автоматичні колонки аудиту (`@CreateDateColumn`, `@UpdateDateColumn`, `@DeleteDateColumn`).
- Засвоїти архітектурний патерн репозиторію (`Repository Pattern`) на базі `@InjectRepository()` та замінити in-memory сховище на повноцінне персистентне збереження даних у базі.
- Реалізувати пагінацію зі зміщенням (`offset-based pagination`) через методи `skip` та `take`, фільтрацію за параметрами рядка запиту та механізм м'якого видалення (`soft delete`).

---

## Технічне забезпечення

- Операційна система: Windows, macOS або Linux.
- Середовище розробки: Visual Studio Code (із розширенням REST Client, Database Client або аналогами).
- Платформа виконання: Node.js версії 18+ (LTS) та пакетний менеджер npm.
- Контейнеризація: Docker Engine та Docker Compose (V2).
- Бібліотеки бекенду: NestJS, `@nestjs/typeorm`, `typeorm`, драйвер `pg`.
- Інструменти тестування API: Postman або файл `requests.http` для REST Client.
- Термінал / CLI: bash, zsh або PowerShell.
- Система контролю версій: Git.

---

## Короткі теоретичні відомості

### 1. Розгортання PostgreSQL через Docker Compose

Для локальної розробки та тестування ізольоване середовище PostgreSQL розгортається за допомогою Docker Compose. Відповідно до специфікації **Compose Specification**, атрибут `version` є застарілим (`deprecated`) і опускається:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: nest_store_db
    restart: unless-stopped
    environment:
      POSTGRES_USER: nest_user
      POSTGRES_PASSWORD: nest_password
      POSTGRES_DB: store_db
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

Запуск та зупинка контейнера у фоновому режимі:

```bash
docker compose up -d
docker compose down
```

---

### 2. Підключення TypeORM до NestJS

Для взаємодії з PostgreSQL встановлюються необхідні пакети:

```bash
npm i @nestjs/typeorm typeorm pg
```

У кореневому модулі `AppModule` підключення конфігурується через метод `TypeOrmModule.forRoot()`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'nest_user',
      password: 'nest_password',
      database: 'store_db',
      autoLoadEntities: true,      // Автоматична реєстрація Entity з Feature Modules
      synchronize: true,           // Автогенерація схеми таблиць (ТІЛЬКИ для розробки!)
    }),
  ],
})
export class AppModule {}
```

---

### 3. Декларування сутностей (Entities) та типи колонок

Сутність (`Entity`) у TypeORM — це клас TypeScript, відображений на таблицю реляційної бази даних за допомогою декоратора `@Entity('table_name')`.

Приклад опису сутності профілю покупця (`CustomerEntity`):

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

export enum CustomerTier {
  Standard = 'STANDARD',
  Premium = 'PREMIUM',
}

@Entity('customers')
export class CustomerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  fullName: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  email: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0.0 })
  bonusBalance: number;

  @Column({ type: 'enum', enum: CustomerTier, default: CustomerTier.Standard })
  tier: CustomerTier;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamp with time zone', nullable: true })
  deletedAt: Date | null;
}
```

Реєстрація сутності у відповідному функціональному модулі:

```typescript
@Module({
  imports: [TypeOrmModule.forFeature([CustomerEntity])],
  providers: [CustomersService],
  controllers: [CustomersController],
})
export class CustomersModule {}
```

---

### 4. Патерн репозиторію та операції CRUD

IoC-контейнер NestJS автоматично надає інстанс `Repository<T>` для кожної зареєстрованої сутності через декоратор `@InjectRepository()`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerEntity } from './customer.entity';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(CustomerEntity)
    private readonly customerRepo: Repository<CustomerEntity>,
  ) {}

  async create(dto: any): Promise<CustomerEntity> {
    const customer = this.customerRepo.create(dto);
    return await this.customerRepo.save(customer);
  }

  async findOne(id: string): Promise<CustomerEntity> {
    const customer = await this.customerRepo.findOneBy({ id });
    if (!customer) {
      throw new NotFoundException(`Покупця з ID ${id} не знайдено`);
    }
    return customer;
  }
}
```

---

### 5. Offset-based пагінація та Soft Delete

#### Пагінація через `skip` та `take`
Метод `findAndCount` одночасно повертає масив записів поточної сторінки та загальну кількість записів у базі (`total`), що дозволяє обчислити метадані пагінації:

```typescript
async findPaginated(page: number = 1, limit: number = 10) {
  const skip = (page - 1) * limit;

  const [items, total] = await this.customerRepo.findAndCount({
    skip,
    take: limit,
    order: { createdAt: 'DESC' },
  });

  return {
    data: items,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}
```

#### М'яке видалення (Soft Delete)
За наявності декоратора `@DeleteDateColumn()` виклик методу `softDelete(id)` або `softRemove(entity)` записує поточну дату й час у колонку `deletedAt`, не видаляючи фізичний рядок з диска. Метод `find()` автоматично фільтрує записи, де `deletedAt IS NOT NULL`.

---

## Постановка задачі

Для забезпечення надійності даних інтернет-магазину необхідно замінити тимчасове in-memory сховище попередніх робіт на промислову базу даних PostgreSQL, використовуючи можливості TypeORM.

У межах практичної роботи необхідно:
1. Описати та запустити контейнер PostgreSQL через `docker-compose.yml` (без застарілої директиви `version`).
2. Сконфігурувати підключення до БД через `TypeOrmModule.forRoot()`.
3. Оголосити клас сутності `Entity` відповідно до індивідуального варіанта зі строгими типами колонок PostgreSQL (`varchar`, `decimal`, `integer`, `boolean`, `enum`, `timestamp with time zone`).
4. Переписати методи сервісу на роботу з репозиторієм TypeORM (`Repository<T>`).
5. Реалізувати `offset-based` пагінацію з поверненням метаданих (`page`, `limit`, `total`, `totalPages`) та можливістю сортування.
6. Впровадити м'яке видалення сутностей (`Soft Delete`) через `@DeleteDateColumn()`.

Параметри сутності та типи даних колонок визначаються індивідуальним **варіантом за номером у журналі**:

### Таблиця варіантів сутності для TypeORM

| Варіант | Категорія магазину | Назва Entity | Колонки та типи PostgreSQL |
|:---:|---|---|---|
| **1** | Електроніка та гаджети | `GadgetEntity` | `title: varchar(150)`, `price: decimal(10,2)`, `warrantyMonths: integer`, `cpu: varchar(100)`, `ramGb: integer`, `isAvailable: boolean` |
| **2** | Книжковий онлайн-магазин | `BookEntity` | `title: varchar(200)`, `price: decimal(8,2)`, `isbn: varchar(20)`, `pageCount: integer`, `author: varchar(120)`, `coverType: enum` |
| **3** | Одяг та взуття | `ClothingEntity` | `title: varchar(150)`, `price: decimal(10,2)`, `size: enum('XS','S','M','L','XL')`, `material: varchar(80)`, `color: varchar(50)` |
| **4** | Доставка їжі та ресторанів | `DishEntity` | `title: varchar(120)`, `price: decimal(8,2)`, `weightGrams: integer`, `calories: integer`, `isSpicy: boolean` |
| **5** | Онлайн-аптека | `MedicineEntity` | `title: varchar(150)`, `price: decimal(10,2)`, `dosageMg: integer`, `isPrescriptionRequired: boolean`, `expirationDate: date` |
| **6** | Будівельні матеріали | `MaterialEntity` | `title: varchar(150)`, `price: decimal(10,2)`, `unitOfMeasure: enum('kg','m2','m3')`, `weightPerUnitKg: decimal(8,2)`, `isHeavyCargo: boolean` |
| **7** | Автозапчастини | `AutoPartEntity` | `title: varchar(150)`, `price: decimal(10,2)`, `oemCode: varchar(50)`, `condition: enum('NEW','REFURBISHED')`, `carBrand: varchar(80)` |
| **8** | Квитки на події | `TicketEntity` | `title: varchar(150)`, `price: decimal(10,2)`, `venue: varchar(150)`, `sector: integer`, `seatNumber: integer`, `isSold: boolean` |
| **9** | Онлайн-курси та підписки | `CourseEntity` | `title: varchar(150)`, `price: decimal(10,2)`, `durationHours: integer`, `difficultyLevel: enum('BEGINNER','MIDDLE','ADVANCED')`, `instructor: varchar(100)` |
| **10** | Зоотовари | `PetSupplyEntity` | `title: varchar(150)`, `price: decimal(10,2)`, `petCategory: enum('CAT','DOG','BIRD','FISH')`, `packageWeightKg: decimal(6,2)`, `brand: varchar(80)` |

> Якщо номер у журналі перевищує 10, варіант обчислюється за формулою: `((номер - 1) % 10) + 1`.

---

## Завдання

Практична робота складається з трьох послідовних рівнів. Кожен наступний рівень базується на попередньому та розширює функціональність розроблюваного рішення.

---

### Рівень 1. Базовий: Docker Compose, TypeORM та модель Entity

1. **Конфігурація середовища бази даних:**
   - Створити у корені проєкту файл `docker-compose.yml` (без застарілого поля `version`).
   - Налаштувати сервіс `postgres` із зазначенням образу `postgres:16-alpine`, порту `5432:5432`, змінних середовища для користувача, пароля та назви бази.
   - Запустити контейнер командою `docker compose up -d` та перевірити статус запуску через `docker compose ps`.

2. **Інтеграція TypeORM у NestJS:**
   - Встановити необхідні залежності:
     ```bash
     npm i @nestjs/typeorm typeorm pg
     ```
   - Налаштувати `TypeOrmModule.forRoot()` у `AppModule` із параметрами підключення до локального контейнера PostgreSQL.
   - Встановити опції `autoLoadEntities: true` та `synchronize: true`.

3. **Створення класу сутності (Entity):**
   - У каталозі свого Feature Module створити файл `entities/<resource>.entity.ts`.
   - Оголосити клас сутності з декоратором `@Entity('<resource_table>')`.
   - Додати первинний ключ з автогенерацією UUID: `@PrimaryGeneratedColumn('uuid') id: string;`.
   - Додати всі специфічні стовпці відповідно до свого **варіанта**, використовуючи точні типи SQL (`type: 'varchar'`, `'decimal'`, `'integer'`, `'boolean'`, `'enum'`).
   - Додати автоматичні колонки дати створення та оновлення:
     - `@CreateDateColumn({ type: 'timestamp with time zone' }) createdAt: Date;`
     - `@UpdateDateColumn({ type: 'timestamp with time zone' }) updatedAt: Date;`
   - Зареєструвати сутність у модулі: `TypeOrmModule.forFeature([<Resource>Entity])`.

4. **Перевірка автогенерації схеми:**
   - Запустити додаток `npm run start:dev`.
   - Переконатися у логах консолі, що TypeORM успішно встановив з'єднання з базою та виконав DDL-запити створення таблиці (`CREATE TABLE ...`).

---

### Рівень 2: персистентний CRUD через Repository

1. **Впровадження репозиторію в сервіс:**
   - Модифікувати конструктор `<Resource>Service`:
     ```typescript
     constructor(
       @InjectRepository(<Resource>Entity)
       private readonly resourceRepo: Repository<<Resource>Entity>,
     ) {}
     ```

2. **Реалізація операцій CRUD через TypeORM:**
   - Метод `create(dto: Create<Resource>Dto)`:
     - Створити екземпляр через `this.resourceRepo.create(dto)`;
     - Зберегти в базу через `await this.resourceRepo.save(...)`;
   - Метод `findAll()`:
     - Повернути всі записи з сортуванням за датою створення:
       `await this.resourceRepo.find({ order: { createdAt: 'DESC' } })`;
   - Метод `findOne(id: string)`:
     - Виконати пошук: `await this.resourceRepo.findOneBy({ id })`;
     - Якщо результат `null` — викинути `NotFoundException(`Сутність з ID ${id} не знайдена`);`
   - Метод `update(id: string, dto: Update<Resource>Dto)`:
     - Перевірити існування сутності через `findOne(id)`;
     - Застосувати зміни та зберегти оновлений запис у базі даних;
   - Метод `remove(id: string)`:
     - Перевірити існування сутності;
     - Видалити запис із таблиці за допомогою `await this.resourceRepo.delete(id)`.

3. **Перевірка збереження стану:**
   - Створити кілька записів через REST Client / Postman.
   - Повністю зупинити та перезапустити процес NestJS.
   - Виконати `GET`-запит і переконатися, що дані збереглися у базі даних PostgreSQL.

---

### Рівень 3. Просунутий: пагінація (`skip`/`take`), фільтрація та Soft Delete

1. **Реалізація Offset-based пагінації та фільтрації:**
   - Створити DTO для пагінації `PaginationQueryDto`:
     - `page?: number` (дефолтне значення `1`);
     - `limit?: number` (дефолтне значення `10`);
     - `search?: string` (пошуковий рядок для поля `title`).
   - Модифікувати метод `findAll(query: PaginationQueryDto)` у сервісі:
     - Використати метод `findAndCount`:
       - `skip: (page - 1) * limit`;
       - `take: limit`;
       - умову пошуку за назвою (наприклад, через оператор TypeORM `ILike(`%${search}%`)`);
     - Повертати стандартизований пагінований об'єкт із полями `data`, `total`, `page`, `totalPages`.

2. **Впровадження механізму Soft Delete:**
   - Додати до класу сутності колонку м'якого видалення:
     `@DeleteDateColumn({ type: 'timestamp with time zone', nullable: true }) deletedAt: Date | null;`
   - Модифікувати метод видалення у сервісі: замість фізичного видалення `delete()` викликати м'яке видалення `await this.resourceRepo.softDelete(id)`.
   - Додати у контролер окремий ендпоінт відновлення видаленої сутності `@Patch(':id/restore')`, що викликає `await this.resourceRepo.restore(id)`.

3. **Наскрізне тестування в `requests.http`:**
   - Створити 5–7 тестових сутностей у базі даних.
   - Перевірити пагінацію:
     - Запит `GET /<resource>?page=1&limit=3` (повинно повернутися рівно 3 сутності та метадані `total`, `totalPages`);
     - Запит другої сторінки `GET /<resource>?page=2&limit=3`.
   - Перевірити Soft Delete:
     - Надіслати `DELETE /<resource>/:id`;
     - Виконати `GET /<resource>` і переконатися, що видалений запис відсутній у загальній видачі;
     - Надіслати `PATCH /<resource>/:id/restore` і переконатися, що запис знову з'явився у каталозі.
   - Зафіксувати результати у звіті `README.md`.

---

## Приклад очікуваного виведення програми

```text
[Nest] 24510  - 09/09/2026, 22:20:00     LOG [NestFactory] Starting Nest application...
[Nest] 24510  - 09/09/2026, 22:20:00     LOG [TypeOrmModule] Database connection established successfully (PostgreSQL 16) +45ms
[Nest] 24510  - 09/09/2026, 22:20:00     LOG [RoutesResolver] GadgetsController {/gadgets}: +5ms
[Nest] 24510  - 09/09/2026, 22:20:00     LOG [RouterExplorer] Mapped {/gadgets, GET} route +2ms
[Nest] 24510  - 09/09/2026, 22:20:00     LOG [RouterExplorer] Mapped {/gadgets/:id/restore, PATCH} route +1ms
[Nest] 24510  - 09/09/2026, 22:20:00     LOG [NestApplication] Nest application successfully started on port 3000 +2ms

=== ТЕСТУВАННЯ ПАГІНАЦІЇ ТА SOFT DELETE ===

> GET /gadgets?page=1&limit=2 HTTP/1.1
> Host: localhost:3000

< HTTP/1.1 200 OK
< Content-Type: application/json; charset=utf-8
{
  "data": [
    {
      "id": "e4b1a37c-501b-4f4d-a2f2-c9a174092b61",
      "title": "Ноутбук Pro 16",
      "price": "45000.00",
      "warrantyMonths": 24,
      "cpu": "M3 Max",
      "ramGb": 36,
      "isAvailable": true,
      "createdAt": "2026-09-09T22:21:00.000Z",
      "updatedAt": "2026-09-09T22:21:00.000Z",
      "deletedAt": null
    },
    {
      "id": "b78c92a1-12ec-412d-947b-1184a7e93c12",
      "title": "Бездротові навушники ANC",
      "price": "5200.00",
      "warrantyMonths": 12,
      "cpu": "H2 Audio Chip",
      "ramGb": 2,
      "isAvailable": true,
      "createdAt": "2026-09-09T22:21:30.000Z",
      "updatedAt": "2026-09-09T22:21:30.000Z",
      "deletedAt": null
    }
  ],
  "meta": {
    "total": 5,
    "page": 1,
    "limit": 2,
    "totalPages": 3
  }
}

> DELETE /gadgets/e4b1a37c-501b-4f4d-a2f2-c9a174092b61 HTTP/1.1
< HTTP/1.1 204 No Content

> PATCH /gadgets/e4b1a37c-501b-4f4d-a2f2-c9a174092b61/restore HTTP/1.1
< HTTP/1.1 200 OK
{
  "message": "Сутність успішно відновлена"
}
```

---

## Контрольні питання

1. Що таке ORM (Object-Relational Mapping)? Які переваги та потенційні недоліки має використання TypeORM порівняно з чистими SQL-запитами?
2. Чому параметр конфігурації `synchronize: true` дозволяється використовувати виключно на етапі розробки і суворо заборонений у виробничому середовищі (`production`)?
3. Чим відрізняється первинний ключ на основі автоінкрементного цілого числа (`increment`) від універсального унікального ідентифікатора (`UUID`)? Які переваги надає UUID у розподілених системах?
4. Які базові методи надає клас `Repository<T>` у TypeORM для вибірки, збереження, оновлення та видалення записів?
5. У чому полягає відмінність між методами `delete()` та `remove()` у репозиторії TypeORM?
6. Як влаштований механізм м'якого видалення (`Soft Delete`)? Які переваги надає колонка `@DeleteDateColumn()` для збереження аудиторського сліду?
7. Як працює пагінація за допомогою параметрів `skip` та `take`? Як вирахувати зміщення `skip` для довільного номера сторінки `page` та розміру вибірки `limit`?
8. Що робить метод `findAndCount()` у TypeORM та чому він є більш оптимальним для реалізації пагінації, ніж окремі виклики `find()` та `count()`?

---

## Критерії оцінювання

Оцінювання здійснюється за шкалою повноти реалізації рівнів практичної роботи:

- **«Задовільно» (Рівень 1):** реалізовано базовий прототип, створено структуру проєкту, програма успішно компілюється та виконує базові сценарії.
- **«Добре» (Рівень 2):** виконано базовий рівень та реалізовано ключову функціональність заняття, забезпечено надійність і безпеку виконання коду.
- **«Відмінно» (Рівень 3):** повністю завершено всі три рівні завдання з дотриманням кращих інженерних практик, чистоти архітектури та оптимізації.
- **Усний захист:** обов'язкове пояснення логіки коду та впевнені відповіді на контрольні питання викладача.

## Вимоги до звітності

1. Опублікувати вихідний код у Git-репозиторії.
2. Оформити файл `README.md` з описом проєкту, інструкцією запуску та обов'язковими скриншотами роботи програми (включаючи демонстрацію відсутності помилок).
3. Продемонструвати роботу програми викладачеві та захистити результати.
