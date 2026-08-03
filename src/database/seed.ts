import { loadEnv } from "../config/env.js";
import { migrate } from "./migrate.js";

const env = loadEnv();
migrate(env.DATABASE_PATH);
