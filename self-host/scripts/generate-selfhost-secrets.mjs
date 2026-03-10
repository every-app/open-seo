import { generateKeyPairSync, randomBytes } from "node:crypto";

function escapeForEnv(value) {
  return value.replace(/\r?\n/g, "\\n");
}

const betterAuthSecret = randomBytes(32).toString("base64");
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

console.log(
  "# Copy these lines into .env\n# See SELF_HOSTING_DOCKER.md for setup instructions",
);
console.log(`BETTER_AUTH_SECRET=${betterAuthSecret}`);
console.log(`JWT_PRIVATE_KEY="${escapeForEnv(privateKey)}"`);
console.log(`JWT_PUBLIC_KEY="${escapeForEnv(publicKey)}"`);
