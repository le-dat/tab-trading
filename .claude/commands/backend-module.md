# Command: backend-module

## Description
Create a new NestJS module following the correct standard pattern for the tapl-chainlink backend.

## When asked to create a new module, ALWAYS create all of the following files:

```
src/modules/{module-name}/
  {module-name}.module.ts
  {module-name}.controller.ts   (if there is a REST API)
  {module-name}.service.ts
  {module-name}.repository.ts
  entities/
    {module-name}.entity.ts
  dto/
    create-{module-name}.dto.ts
    update-{module-name}.dto.ts
    query-{module-name}.dto.ts
  interfaces/
    {module-name}.interface.ts
  {module-name}.spec.ts
```

## Template: Module
```typescript
@Module({
  imports: [TypeOrmModule.forFeature([{ModuleName}Entity])],
  controllers: [{ModuleName}Controller],
  providers: [{ModuleName}Service, {ModuleName}Repository],
  exports: [{ModuleName}Service],
})
export class {ModuleName}Module {}
```

## Template: Service
```typescript
@Injectable()
export class {ModuleName}Service {
  private readonly logger = new Logger({ModuleName}Service.name);

  constructor(
    @InjectRepository({ModuleName}Entity)
    private readonly repo: Repository<{ModuleName}Entity>,
    private readonly redisService: RedisService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  async create(dto: Create{ModuleName}Dto): Promise<{ModuleName}Entity> {
    this.logger.log(`Creating {moduleName}: ${JSON.stringify(dto)}`);
    const entity = this.repo.create(dto);
    const saved = await this.repo.save(entity);
    await this.kafkaProducer.send('{module-name}.created', saved);
    return saved;
  }

  async findById(id: string): Promise<{ModuleName}Entity> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`{ModuleName} ${id} not found`);
    return entity;
  }

  async findByUser(userId: string): Promise<{ModuleName}Entity[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }
}
```

## Template: Entity
```typescript
@Entity('{module_name}s')
export class {ModuleName}Entity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

## Template: DTO
```typescript
export class Create{ModuleName}Dto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @Min(0)
  amount: number;
}

export class Query{ModuleName}Dto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsEnum({ModuleName}Status)
  status?: {ModuleName}Status;
}
```

## Template: Controller
```typescript
@Controller('{module-name}s')
@UseGuards(JwtAuthGuard)
export class {ModuleName}Controller {
  constructor(private readonly service: {ModuleName}Service) {}

  @Post()
  create(@Body() dto: Create{ModuleName}Dto, @CurrentUser() user: UserEntity) {
    return this.service.create({ ...dto, userId: user.id });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }

  @Get()
  findAll(@Query() query: Query{ModuleName}Dto) {
    return this.service.findByUser(query.userId);
  }
}
```

## Template: Unit Test
```typescript
describe('{ModuleName}Service', () => {
  let service: {ModuleName}Service;
  let repo: jest.Mocked<Repository<{ModuleName}Entity>>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        {ModuleName}Service,
        { provide: getRepositoryToken({ModuleName}Entity), useValue: createMockRepo() },
        { provide: RedisService, useValue: createMockRedis() },
        { provide: KafkaProducerService, useValue: createMockKafka() },
      ],
    }).compile();
    service = module.get({ModuleName}Service);
    repo = module.get(getRepositoryToken({ModuleName}Entity));
  });

  it('creates and emits kafka event', async () => {
    const dto = { name: 'test', amount: 100 };
    await service.create(dto);
    expect(repo.save).toHaveBeenCalled();
    expect(kafkaProducer.send).toHaveBeenCalledWith('{module-name}.created', expect.any(Object));
  });

  it('throws NotFoundException when not found', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findById('bad-id')).rejects.toThrow(NotFoundException);
  });
});
```

## After creating the module, remember to:
1. Import it into `app.module.ts`
2. Run `yarn migration:generate` if there is a new entity
3. Add a Kafka consumer if the module needs to listen for events from other modules
4. For modules related to EVM (payment, settlement): inject `TapOrderAdapter` from `adapters/`
