import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'database.sqlite');

class Database {
  constructor() {
    this.db = null;
  }

  init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  async createTables() {
    const run = promisify(this.db.run.bind(this.db));
    
    // Users table
    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'employee',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Fish types table
    await run(`
      CREATE TABLE IF NOT EXISTS fish_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ponds table
    await run(`
      CREATE TABLE IF NOT EXISTS ponds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        fish_type_id INTEGER,
        seed_date DATE,
        seed_count INTEGER,
        estimated_harvest_date DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fish_type_id) REFERENCES fish_types(id)
      )
    `);

    // Customers table
    await run(`
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Transactions (Income/Sales) table
    await run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        pond_id INTEGER,
        customer_id INTEGER,
        weight_kg REAL NOT NULL,
        price_per_kg INTEGER NOT NULL,
        total INTEGER NOT NULL,
        payment_method TEXT,
        payment_status TEXT NOT NULL DEFAULT 'paid',
        notes TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pond_id) REFERENCES ponds(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);

    // Expenses table
    await run(`
      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        category TEXT NOT NULL,
        amount INTEGER NOT NULL,
        description TEXT,
        receipt_path TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);

    // Feed stock table
    await run(`
      CREATE TABLE IF NOT EXISTS feed_stock (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_date DATE NOT NULL,
        quantity_sack REAL NOT NULL,
        quantity_kg REAL NOT NULL,
        total_price INTEGER NOT NULL,
        brand TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Feed usage table
    await run(`
      CREATE TABLE IF NOT EXISTS feed_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        pond_id INTEGER,
        quantity_kg REAL NOT NULL,
        notes TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pond_id) REFERENCES ponds(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);

    // Seed stocking table
    await run(`
      CREATE TABLE IF NOT EXISTS seed_stocking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        pond_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        size TEXT,
        price INTEGER,
        notes TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pond_id) REFERENCES ponds(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);

    // Growth monitoring table
    await run(`
      CREATE TABLE IF NOT EXISTS growth_monitoring (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        pond_id INTEGER NOT NULL,
        avg_weight_gram REAL,
        estimated_total_weight_kg REAL,
        pond_condition TEXT,
        notes TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pond_id) REFERENCES ponds(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);

    // Debts/Receivables table
    await run(`
      CREATE TABLE IF NOT EXISTS debts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id INTEGER,
        customer_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        paid_amount INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'unpaid',
        due_date DATE,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (transaction_id) REFERENCES transactions(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      )
    `);

    // Debt payments table
    await run(`
      CREATE TABLE IF NOT EXISTS debt_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        debt_id INTEGER NOT NULL,
        payment_date DATE NOT NULL,
        amount INTEGER NOT NULL,
        payment_method TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (debt_id) REFERENCES debts(id)
      )
    `);

    // Insert default fish type (Nila)
    await run(`
      INSERT OR IGNORE INTO fish_types (id, name) VALUES (1, 'Ikan Nila')
    `);

    // Insert default ponds
    const defaultPonds = [
      { name: 'Kolam 1', type: 'production' },
      { name: 'Kolam 2', type: 'production' },
      { name: 'Kolam 3', type: 'production' },
      { name: 'Kolam 4', type: 'production' },
      { name: 'Kolam Penampungan', type: 'holding' }
    ];

    for (const pond of defaultPonds) {
      await run(`
        INSERT OR IGNORE INTO ponds (name, type, fish_type_id) 
        VALUES (?, ?, 1)
      `, [pond.name, pond.type]);
    }

    console.log('Database tables created successfully');
  }

  getDb() {
    return this.db;
  }

  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }
}

const db = new Database();
export default db;

