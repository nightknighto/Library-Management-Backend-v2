import { z } from 'zod';

const reqString = (message: string) => z.string({ required_error: message }).min(1, { message });
const reqUrl = (message: string) => z.string({ required_error: message }).url({ message });

const defaultPort = 3001;

/**
 * Configuration schema for the application using Zod validation.
 * 
 * @description Defines the structure and validation rules for application configuration
 * including JWT authentication, server port, and database connection settings.
 * 
 * @property {string} jwtSecret - Required JWT secret key for token signing and verification
 * @property {number} port - Server port number, defaults to defaultPort if not specified
 * @property {string} databaseURL - Required valid URL for database connection
 */
const configSchema = z.object({
    jwtSecret: reqString('JWT_SECRET is required'),
    port: z.coerce.number().default(defaultPort),
    databaseURL: reqUrl('DATABASE_URL must be a valid URL'),
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
        ${parsedConfig.error.errors.map((error) => `- ${error.message}`).join('\n\t')}`,
    );

    process.exit(1);
}

export const CONFIG = parsedConfig.data;
