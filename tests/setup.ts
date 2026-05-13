// Mock Prisma client
export const mockPrismaUser = {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
};

export const mockPrisma = {
    user: mockPrismaUser,
    book: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
    borrow: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
};

// Mock the prisma module
vi.mock('../src/prisma', () => ({
    prisma: mockPrisma,
}));

// Mock JWT Service
export const mockJwtService = {
    createToken: vi.fn(),
    verifyToken: vi.fn(),
};

vi.mock('../src/services', () => ({
    JwtService: mockJwtService,
}));

// Reset all mocks before each test
beforeEach(() => {
    vi.clearAllMocks();
});
