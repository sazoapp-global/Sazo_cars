// npm run seed:categories -w @sazo/api: give a category (New, Imported used or Ugandan used, D-163) to the test cars
// already in a development database that have none. Safe to run again: cars that have a category are left alone.
import pg from 'pg';
import { CAR_CATEGORY_LABELS, isCarCategory } from '@sazo/contracts';
import { loadConfig } from '../config.js';
import { fillCategories } from './categories.js';

const config = loadConfig();
if (config.NODE_ENV === 'production') throw new Error('Refusing to change cars in production: dealers choose their own categories there');
const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
const rows = await fillCategories(pool);
if (!rows.length) console.log('Every car already has a category, so there is nothing to do.');
for (const r of rows) console.log(`  ${(isCarCategory(r.category) ? CAR_CATEGORY_LABELS[r.category] : r.category).padEnd(14)} ${r.cars} ${r.cars === 1 ? 'car' : 'cars'}`);
await pool.end();
