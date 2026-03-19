import { Client } from "@opensearch-project/opensearch";

const client = new Client({
    node: process.env.OPENSEARCH_URL || "http://localhost:9200",
    auth: {
        username: process.env.OPENSEARCH_USER || "admin",
        password: process.env.OPENSEARCH_PASS || "admin",
    },
    ssl: {
        rejectUnauthorized: false, // for local dev only
    },
});

export default client;