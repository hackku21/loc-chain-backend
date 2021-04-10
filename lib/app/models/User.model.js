"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const orm_1 = require("@extollo/orm");
class User extends orm_1.Model {
}
exports.User = User;
User.table = 'users';
User.key = 'user_id';
