import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for file uploads
const uploadDir = path.join(__dirname, '..', 'uploads', 'receipts');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'receipt-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (jpeg, jpg, png) and PDF are allowed'));
    }
  }
});

// Get all expenses
router.get('/', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, category } = req.query;
    
    let query = `
      SELECT e.*, u.name as created_by_name
      FROM expenses e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (startDate) {
      query += ' AND e.date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND e.date <= ?';
      params.push(endDate);
    }
    if (category) {
      query += ' AND e.category = ?';
      params.push(category);
    }

    query += ' ORDER BY e.date DESC, e.created_at DESC';

    const expenses = await db.query(query, params);
    res.json(expenses);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single expense
router.get('/:id', authenticate, async (req, res) => {
  try {
    const expense = await db.get(`
      SELECT e.*, u.name as created_by_name
      FROM expenses e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.id = ?
    `, [req.params.id]);

    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    res.json(expense);
  } catch (error) {
    console.error('Error fetching expense:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create expense
router.post('/', authenticate, upload.single('receipt'), async (req, res) => {
  try {
    const { date, category, amount, description } = req.body;

    if (!date || !category || !amount) {
      return res.status(400).json({ error: 'Date, category, and amount are required' });
    }

    const receiptPath = req.file ? `/uploads/receipts/${req.file.filename}` : null;

    const result = await db.run(
      `INSERT INTO expenses (date, category, amount, description, receipt_path, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [date, category, amount, description || null, receiptPath, req.user.id]
    );

    const expense = await db.get('SELECT * FROM expenses WHERE id = ?', [result.id]);
    res.status(201).json(expense);
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update expense
router.put('/:id', authenticate, upload.single('receipt'), async (req, res) => {
  try {
    const { date, category, amount, description } = req.body;

    let receiptPath = null;
    if (req.file) {
      receiptPath = `/uploads/receipts/${req.file.filename}`;
      
      // Delete old receipt if exists
      const oldExpense = await db.get('SELECT receipt_path FROM expenses WHERE id = ?', [req.params.id]);
      if (oldExpense?.receipt_path) {
        const oldPath = path.join(__dirname, '..', oldExpense.receipt_path);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }
    } else {
      const existing = await db.get('SELECT receipt_path FROM expenses WHERE id = ?', [req.params.id]);
      receiptPath = existing?.receipt_path || null;
    }

    await db.run(
      `UPDATE expenses 
       SET date = ?, category = ?, amount = ?, description = ?, receipt_path = ?
       WHERE id = ?`,
      [date, category, amount, description || null, receiptPath, req.params.id]
    );

    const expense = await db.get('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
    res.json(expense);
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete expense
router.delete('/:id', authenticate, async (req, res) => {
  try {
    // Check if user is admin/owner
    if (req.user.role !== 'admin' && req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only admin can delete expenses' });
    }

    // Delete receipt file if exists
    const expense = await db.get('SELECT receipt_path FROM expenses WHERE id = ?', [req.params.id]);
    if (expense?.receipt_path) {
      const filePath = path.join(__dirname, '..', expense.receipt_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await db.run('DELETE FROM expenses WHERE id = ?', [req.params.id]);
    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

