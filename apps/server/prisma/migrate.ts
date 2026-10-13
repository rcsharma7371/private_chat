import dotenv from 'dotenv';
import { runMigration } from '../src/services/migrationService.js';

dotenv.config();

export { runMigration };

if (process.argv[1] && process.argv[1].includes('migrate.ts')) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
