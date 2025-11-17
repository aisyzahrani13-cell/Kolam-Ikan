import express from 'express';
import db from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// ========== FEED STOCK ==========

// Get feed stock
router.get('/feed', authenticate, async (req, res) => {
  try {
    const stock = await db.query(`
      SELECT * FROM feed_stock ORDER BY purchase_date DESC
    `);
    
    // Calculate current stock
    const totalPurchased = stock.reduce((sum, s) => sum + (s.quantity_kg || 0), 0);
    const totalUsed = await db.get(`
      SELECT COALESCE(SUM(quantity_kg), 0) as total FROM feed_usage
    `);
    const currentStock = totalPurchased - (totalUsed?.total || 0);

    res.json({
      stock: stock,
      currentStock: currentStock,
      totalPurchased: totalPurchased,
      totalUsed: totalUsed?.total || 0
    });
  } catch (error) {
    console.error('Error fetching feed stock:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add feed purchase
router.post('/feed', authenticate, async (req, res) => {
  try {
    const { purchase_date, quantity_sack, quantity_kg, total_price, brand, notes } = req.body;

    if (!purchase_date || !quantity_kg || !total_price) {
      return res.status(400).json({ error: 'Purchase date, quantity, and price are required' });
    }

    const result = await db.run(
      `INSERT INTO feed_stock (purchase_date, quantity_sack, quantity_kg, total_price, brand, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [purchase_date, quantity_sack || null, quantity_kg, total_price, brand || null, notes || null]
    );

    const feed = await db.get('SELECT * FROM feed_stock WHERE id = ?', [result.id]);
    res.status(201).json(feed);
  } catch (error) {
    console.error('Error adding feed stock:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== FEED USAGE ==========

// Get feed usage
router.get('/feed/usage', authenticate, async (req, res) => {
  try {
    const { pondId, startDate, endDate } = req.query;
    
    let query = `
      SELECT fu.*, p.name as pond_name, u.name as created_by_name
      FROM feed_usage fu
      LEFT JOIN ponds p ON fu.pond_id = p.id
      LEFT JOIN users u ON fu.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (pondId) {
      query += ' AND fu.pond_id = ?';
      params.push(pondId);
    }
    if (startDate) {
      query += ' AND fu.date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND fu.date <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY fu.date DESC';

    const usage = await db.query(query, params);
    res.json(usage);
  } catch (error) {
    console.error('Error fetching feed usage:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Record feed usage
router.post('/feed/usage', authenticate, async (req, res) => {
  try {
    const { date, pond_id, quantity_kg, notes } = req.body;

    if (!date || !pond_id || !quantity_kg) {
      return res.status(400).json({ error: 'Date, pond, and quantity are required' });
    }

    const result = await db.run(
      `INSERT INTO feed_usage (date, pond_id, quantity_kg, notes, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [date, pond_id, quantity_kg, notes || null, req.user.id]
    );

    const usage = await db.get(`
      SELECT fu.*, p.name as pond_name
      FROM feed_usage fu
      LEFT JOIN ponds p ON fu.pond_id = p.id
      WHERE fu.id = ?
    `, [result.id]);

    res.status(201).json(usage);
  } catch (error) {
    console.error('Error recording feed usage:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== SEED STOCKING ==========

// Get seed stockings
router.get('/seed', authenticate, async (req, res) => {
  try {
    const { pondId } = req.query;
    
    let query = `
      SELECT ss.*, p.name as pond_name, u.name as created_by_name
      FROM seed_stocking ss
      LEFT JOIN ponds p ON ss.pond_id = p.id
      LEFT JOIN users u ON ss.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (pondId) {
      query += ' AND ss.pond_id = ?';
      params.push(pondId);
    }

    query += ' ORDER BY ss.date DESC';

    const stockings = await db.query(query, params);
    res.json(stockings);
  } catch (error) {
    console.error('Error fetching seed stockings:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Record seed stocking
router.post('/seed', authenticate, async (req, res) => {
  try {
    const { date, pond_id, quantity, size, price, notes } = req.body;

    if (!date || !pond_id || !quantity) {
      return res.status(400).json({ error: 'Date, pond, and quantity are required' });
    }

    const result = await db.run(
      `INSERT INTO seed_stocking (date, pond_id, quantity, size, price, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [date, pond_id, quantity, size || null, price || null, notes || null, req.user.id]
    );

    // Update pond seed info
    await db.run(
      `UPDATE ponds 
       SET seed_date = ?, seed_count = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [date, quantity, pond_id]
    );

    const stocking = await db.get(`
      SELECT ss.*, p.name as pond_name
      FROM seed_stocking ss
      LEFT JOIN ponds p ON ss.pond_id = p.id
      WHERE ss.id = ?
    `, [result.id]);

    res.status(201).json(stocking);
  } catch (error) {
    console.error('Error recording seed stocking:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== GROWTH MONITORING ==========

// Get growth monitoring records
router.get('/monitoring', authenticate, async (req, res) => {
  try {
    const { pondId, startDate, endDate } = req.query;
    
    let query = `
      SELECT gm.*, p.name as pond_name, u.name as created_by_name
      FROM growth_monitoring gm
      LEFT JOIN ponds p ON gm.pond_id = p.id
      LEFT JOIN users u ON gm.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (pondId) {
      query += ' AND gm.pond_id = ?';
      params.push(pondId);
    }
    if (startDate) {
      query += ' AND gm.date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND gm.date <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY gm.date DESC';

    const records = await db.query(query, params);
    res.json(records);
  } catch (error) {
    console.error('Error fetching growth monitoring:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Record growth monitoring
router.post('/monitoring', authenticate, async (req, res) => {
  try {
    const { date, pond_id, avg_weight_gram, estimated_total_weight_kg, pond_condition, notes } = req.body;

    if (!date || !pond_id) {
      return res.status(400).json({ error: 'Date and pond are required' });
    }

    const result = await db.run(
      `INSERT INTO growth_monitoring 
       (date, pond_id, avg_weight_gram, estimated_total_weight_kg, pond_condition, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [date, pond_id, avg_weight_gram || null, estimated_total_weight_kg || null, 
       pond_condition || null, notes || null, req.user.id]
    );

    const record = await db.get(`
      SELECT gm.*, p.name as pond_name
      FROM growth_monitoring gm
      LEFT JOIN ponds p ON gm.pond_id = p.id
      WHERE gm.id = ?
    `, [result.id]);

    res.status(201).json(record);
  } catch (error) {
    console.error('Error recording growth monitoring:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

