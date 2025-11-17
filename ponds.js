import express from 'express';
import db from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Get all ponds
router.get('/', authenticate, async (req, res) => {
  try {
    const ponds = await db.query(`
      SELECT p.*, ft.name as fish_type_name
      FROM ponds p
      LEFT JOIN fish_types ft ON p.fish_type_id = ft.id
      ORDER BY p.name
    `);
    res.json(ponds);
  } catch (error) {
    console.error('Error fetching ponds:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single pond
router.get('/:id', authenticate, async (req, res) => {
  try {
    const pond = await db.get(`
      SELECT p.*, ft.name as fish_type_name
      FROM ponds p
      LEFT JOIN fish_types ft ON p.fish_type_id = ft.id
      WHERE p.id = ?
    `, [req.params.id]);

    if (!pond) {
      return res.status(404).json({ error: 'Pond not found' });
    }

    res.json(pond);
  } catch (error) {
    console.error('Error fetching pond:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create pond
router.post('/', authenticate, authorize('admin', 'owner'), async (req, res) => {
  try {
    const { name, type, fish_type_id, seed_date, seed_count, estimated_harvest_date } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    const result = await db.run(
      `INSERT INTO ponds (name, type, fish_type_id, seed_date, seed_count, estimated_harvest_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, type, fish_type_id || 1, seed_date || null, seed_count || null, estimated_harvest_date || null]
    );

    const pond = await db.get('SELECT * FROM ponds WHERE id = ?', [result.id]);
    res.status(201).json(pond);
  } catch (error) {
    console.error('Error creating pond:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update pond
router.put('/:id', authenticate, authorize('admin', 'owner'), async (req, res) => {
  try {
    const { name, type, fish_type_id, seed_date, seed_count, estimated_harvest_date } = req.body;

    await db.run(
      `UPDATE ponds 
       SET name = ?, type = ?, fish_type_id = ?, seed_date = ?, seed_count = ?, 
           estimated_harvest_date = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, type, fish_type_id, seed_date, seed_count, estimated_harvest_date, req.params.id]
    );

    const pond = await db.get('SELECT * FROM ponds WHERE id = ?', [req.params.id]);
    res.json(pond);
  } catch (error) {
    console.error('Error updating pond:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete pond
router.delete('/:id', authenticate, authorize('admin', 'owner'), async (req, res) => {
  try {
    await db.run('DELETE FROM ponds WHERE id = ?', [req.params.id]);
    res.json({ message: 'Pond deleted successfully' });
  } catch (error) {
    console.error('Error deleting pond:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

