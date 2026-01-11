// Mock Prisma client
export const mockPrismaUser = {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
};

export const mockPrisma = {
    user: mockPrismaUser,
    book: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
    borrow: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
};

// Mock the prisma module
jest.mock('../src/prisma', () => ({
    prisma: mockPrisma,
}));

// Mock JWT Service
export const mockJwtService = {
    createToken: jest.fn(),
    verifyToken: jest.fn(),
};

jest.mock('../src/services', () => ({
    JwtService: mockJwtService,
}));

// Reset all mocks before each test
beforeEach(() => {
    jest.clearAllMocks();
});