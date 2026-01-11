import jwt from "jsonwebtoken";
import { CONFIG } from "../../config/config.ts";

const JWT_SECRET = CONFIG.jwtSecret;

interface JwtPayload {
    email: string;
}

export namespace JwtService {
    export const createToken = (payload: JwtPayload) => {
        return jwt.sign(payload, JWT_SECRET, { expiresIn: "1d" });
    };

    export const verifyToken = (token: string) => {
        return jwt.verify(token, JWT_SECRET) as JwtPayload;
    };
}