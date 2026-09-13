import { redis, RedisClient } from "bun";

export class CacheClient {
    static async get(key: RedisClient.KeyLike) {
        return redis.get(key);
    }
    static async set(key: RedisClient.KeyLike, value: RedisClient.KeyLike) {
        return redis.set(key, value);
    }
}
