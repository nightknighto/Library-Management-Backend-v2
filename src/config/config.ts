import { z } from 'zod';

const reqString = (message: string) =>
    z
        .string({
            error: (issue) => (issue.input === undefined ? message : undefined),
        })
        .min(1, { message });

const defaultPort = 3001;

/**
 * Configuration schema for the application using Zod validation.
 *
 * @description Defines the structure and validation rules for application configuration
 * including JWT authentication, server port, and database connection settings.
 *
 * @property {string} jwtSecret - Required JWT secret key for token signing and verification
 * @property {number} port - Server port number, defaults to defaultPort if not specified
 * @property {string} databaseURL - Required database connection string (e.g. a SQLite `file:` path)
 */
const configSchema = z.object({
    jwtSecret: reqString('JWT_SECRET is required'),
    port: z.coerce.number().prefault(defaultPort),
    databaseURL: reqString('DATABASE_URL is required'),
});

const rawConfig = {
    port: process.env.PORT,
    jwtSecret: process.env.JWT_SECRET,
    databaseURL: process.env.DATABASE_URL,
};

const parsedConfig = configSchema.safeParse(rawConfig);

if (!parsedConfig.success) {
    console.error(
        `Invalid configuration, please set the following variables in your .env file:
        ${parsedConfig.error.issues.map((error) => `- ${error.message}`).join('\n\t')}`,
    );

    process.exit(1);
}

export const CONFIG = parsedConfig.data;
