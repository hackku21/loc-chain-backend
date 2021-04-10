import { env } from "@extollo/lib";

export default {
    connections: {
        default: {
            user: env('DATABASE_USERNAME', 'extollo'),
            password: env('DATABASE_PASSWORD'),
            host: env('DATABASE_HOST', 'localhost'),
            port: env('DATABASE_PORT', 5432),
            database: env('DATABASE_NAME', 'extollo_1'),
            dialect: env('DATABASE_DIALECT', 'postgres'),
        },
    },
}
