import dotenv from 'dotenv';
import { setupMongoIndexes } from '../src/services/migrationService.js';

dotenv.config();

export { setupMongoIndexes };

if (process.argv[1] && process.argv[1].includes('seed.ts')) {
  setupMongoIndexes()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
