"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lib_1 = require("@extollo/lib");
exports.default = {
    connections: {
        default: {
            user: lib_1.env('DATABASE_USERNAME', 'extollo'),
            password: lib_1.env('DATABASE_PASSWORD'),
            host: lib_1.env('DATABASE_HOST', 'localhost'),
            port: lib_1.env('DATABASE_PORT', 5432),
            database: lib_1.env('DATABASE_NAME', 'extollo_1'),
            dialect: lib_1.env('DATABASE_DIALECT', 'postgres'),
        },
    },
};
