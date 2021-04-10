import {Model} from "@extollo/orm";

export class User extends Model<User> {
    protected static table = 'users';
    protected static key = 'user_id';
}
