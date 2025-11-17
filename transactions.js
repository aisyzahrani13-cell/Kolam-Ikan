import express from 'express';
import db from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Get all transactions
router.get('/', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, customerId, pondId } = req.query;
    
    let query = `
      SELECT t.*, 
             p.name as pond_name,
             c.name as customer_name,
             u.name as created_by_name
      FROM transactions t
      LEFT JOIN ponds p ON t.pond_id = p.id
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN users u ON t.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (startDate) {
      query += ' AND t.date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND t.date <= ?';
      params.push(endDate);
    }
    if (customerId) {
      query += ' AND t.customer_id = ?';
      params.push(customerId);
    }
    if (pondId) {
      query += ' AND t.pond_id = ?';
      params.push(pondId);
    }

    query += ' ORDER BY t.date DESC, t.created_at DESC';

    const transactions = await db.query(query, params);
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single transaction
router.get('/:id', authenticate, async (req, res) => {
  try {
    const transaction = await db.get(`
      SELECT t.*, 
             p.name as pond_name,
             c.name as customer_name,
             u.name as created_by_name
      FROM transactions t
      LEFT JOIN ponds p ON t.pond_id = p.id
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.id = ?
    `, [req.params.id]);

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json(transaction);
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create transaction
router.post('/', authenticate, async (req, res) => {
  try {
    const { date, pond_id, customer_id, weight_kg, price_per_kg, payment_method, payment_status, notes } = req.body;

    if (!date || !customer_id || !weight_kg || !price_per_kg) {
      return res.status(400).json({ error: 'Date, customer, weight, and price are required' });
    }

    const total = Math.round(weight_kg * price_per_kg);

    const result = await db.run(
      `INSERT INTO transactions 
       (date, pond_id, customer_id, weight_kg, price_per_kg, total, payment_method, payment_status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [date, pond_id || null, customer_id, weight_kg, price_per_kg, total, 
       payment_method || null, payment_status || 'paid', notes || null, req.user.id]
    );

    // If payment status is unpaid, create debt record
    if (payment_status === 'unpaid') {
      await db.run(
        `INSERT INTO debts (transaction_id, customer_id, amount, status)
         VALUES (?, ?, ?, 'unpaid')`,
        [result.id, customer_id, total]
      );
    }

    const transaction = await db.get(`
      SELECT t.*, 
             p.name as pond_name,
             c.name as customer_name
      FROM transactions t
      LEFT JOIN ponds p ON t.pond_id = p.id
      LEFT JOIN customers c ON t.customer_id = c.id
      WHERE t.id = ?
    `, [result.id]);

    res.status(201).json(transaction);
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update transaction
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { date, pond_id, customer_id, weight_kg, price_per_kg, payment_method, payment_status, notes } = req.body;

    const total = Math.round(weight_kg * price_per_kg);

    await db.run(
      `UPDATE transactions 
       SET date = ?, pond_id = ?, customer_id = ?, weight_kg = ?, price_per_kg = ?, 
           total = ?, payment_method = ?, payment_status = ?, notes = ?
       WHERE id = ?`,
      [date, pond_id, customer_id, weight_kg, price_per_kg, total, 
       payment_method, payment_status, notes, req.params.id]
    );

    // Update debt if payment status changed
    if (payment_status === 'unpaid') {
      const existingDebt = await db.get('SELECT * FROM debts WHERE transaction_id = ?', [req.params.id]);
      if (!existingDebt) {
        await db.run(
          `INSERT INTO debts (transaction_id, customer_id, amount, status)
           VALUES (?, ?, ?, 'unpaid')`,
          [req.params.id, customer_id, total]
        );
      } else {
        await db.run(
          'UPDATE debts SET amount = ? WHERE transaction_id = ?',
          [total, req.params.id]
        );
      }
    } else {
      await db.run('UPDATE debts SET status = ? WHERE transaction_id = ?', ['paid', req.params.id]);
    }

    const transaction = await db.get(`
      SELECT t.*, 
             p.name as pond_name,
             c.name as customer_name
      FROM transactions t
      LEFT JOIN ponds p ON t.pond_id = p.id
      LEFT JOIN customers c ON t.customer_id = c.id
      WHERE t.id = ?
    `, [req.params.id]);

    res.json(transaction);
  } catch (error) {
    console.error('Error updating transaction:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete transaction
router.delete('/:id', authenticate, async (req, res) => {
  try {
    // Check if user is admin/owner
    if (req.user.role !== 'admin' && req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only admin can delete transactions' });
    }

    await db.run('DELETE FROM transactions WHERE id = ?', [req.params.id]);
    await db.run('DELETE FROM debts WHERE transaction_id = ?', [req.params.id]);
    res.json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

