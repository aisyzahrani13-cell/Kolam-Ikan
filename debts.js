import express from 'express';
import db from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Get all debts
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, customerId } = req.query;
    
    let query = `
      SELECT d.*, 
             c.name as customer_name,
             c.phone as customer_phone,
             t.date as transaction_date,
             t.weight_kg,
             t.price_per_kg
      FROM debts d
      LEFT JOIN customers c ON d.customer_id = c.id
      LEFT JOIN transactions t ON d.transaction_id = t.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND d.status = ?';
      params.push(status);
    }
    if (customerId) {
      query += ' AND d.customer_id = ?';
      params.push(customerId);
    }

    query += ' ORDER BY d.created_at DESC';

    const debts = await db.query(query, params);
    
    // Calculate remaining amount for each debt
    const debtsWithRemaining = await Promise.all(debts.map(async (debt) => {
      const payments = await db.query(
        'SELECT COALESCE(SUM(amount), 0) as total_paid FROM debt_payments WHERE debt_id = ?',
        [debt.id]
      );
      const totalPaid = payments[0]?.total_paid || 0;
      const remaining = debt.amount - totalPaid;
      
      return {
        ...debt,
        paid_amount: totalPaid,
        remaining_amount: remaining,
        status: remaining <= 0 ? 'paid' : 'unpaid'
      };
    }));

    res.json(debtsWithRemaining);
  } catch (error) {
    console.error('Error fetching debts:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single debt
router.get('/:id', authenticate, async (req, res) => {
  try {
    const debt = await db.get(`
      SELECT d.*, 
             c.name as customer_name,
             c.phone as customer_phone,
             t.date as transaction_date
      FROM debts d
      LEFT JOIN customers c ON d.customer_id = c.id
      LEFT JOIN transactions t ON d.transaction_id = t.id
      WHERE d.id = ?
    `, [req.params.id]);

    if (!debt) {
      return res.status(404).json({ error: 'Debt not found' });
    }

    const payments = await db.query(
      'SELECT * FROM debt_payments WHERE debt_id = ? ORDER BY payment_date DESC',
      [req.params.id]
    );

    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = debt.amount - totalPaid;

    res.json({
      ...debt,
      payments: payments,
      paid_amount: totalPaid,
      remaining_amount: remaining
    });
  } catch (error) {
    console.error('Error fetching debt:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Record debt payment
router.post('/:id/payments', authenticate, async (req, res) => {
  try {
    const { payment_date, amount, payment_method, notes } = req.body;

    if (!payment_date || !amount) {
      return res.status(400).json({ error: 'Payment date and amount are required' });
    }

    const debt = await db.get('SELECT * FROM debts WHERE id = ?', [req.params.id]);
    if (!debt) {
      return res.status(404).json({ error: 'Debt not found' });
    }

    // Record payment
    const result = await db.run(
      `INSERT INTO debt_payments (debt_id, payment_date, amount, payment_method, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [req.params.id, payment_date, amount, payment_method || null, notes || null]
    );

    // Calculate total paid
    const payments = await db.query(
      'SELECT COALESCE(SUM(amount), 0) as total_paid FROM debt_payments WHERE debt_id = ?',
      [req.params.id]
    );
    const totalPaid = payments[0]?.total_paid || 0;

    // Update debt status if fully paid
    if (totalPaid >= debt.amount) {
      await db.run(
        'UPDATE debts SET status = ?, paid_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['paid', totalPaid, req.params.id]
      );
    } else {
      await db.run(
        'UPDATE debts SET paid_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [totalPaid, req.params.id]
      );
    }

    const payment = await db.get('SELECT * FROM debt_payments WHERE id = ?', [result.id]);
    res.status(201).json(payment);
  } catch (error) {
    console.error('Error recording debt payment:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get debt payments
router.get('/:id/payments', authenticate, async (req, res) => {
  try {
    const payments = await db.query(
      'SELECT * FROM debt_payments WHERE debt_id = ? ORDER BY payment_date DESC',
      [req.params.id]
    );
    res.json(payments);
  } catch (error) {
    console.error('Error fetching debt payments:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

