import express from 'express';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType } from 'docx';
import db from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Helper function to format currency
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount);
};

// Daily Report
router.get('/daily', authenticate, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }

    // Get income
    const income = await db.query(`
      SELECT COALESCE(SUM(total), 0) as total
      FROM transactions
      WHERE date = ?
    `, [date]);

    // Get expenses
    const expenses = await db.query(`
      SELECT category, COALESCE(SUM(amount), 0) as total
      FROM expenses
      WHERE date = ?
      GROUP BY category
    `, [date]);

    const totalExpenses = expenses.reduce((sum, e) => sum + e.total, 0);
    const profit = income[0]?.total || 0 - totalExpenses;

    res.json({
      date,
      income: income[0]?.total || 0,
      expenses: expenses,
      totalExpenses,
      profit
    });
  } catch (error) {
    console.error('Error generating daily report:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Weekly Report
router.get('/weekly', authenticate, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const income = await db.query(`
      SELECT COALESCE(SUM(total), 0) as total
      FROM transactions
      WHERE date >= ? AND date <= ?
    `, [startDate, endDate]);

    const expenses = await db.query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM expenses
      WHERE date >= ? AND date <= ?
    `, [startDate, endDate]);

    const totalIncome = income[0]?.total || 0;
    const totalExpenses = expenses[0]?.total || 0;
    const profit = totalIncome - totalExpenses;

    res.json({
      startDate,
      endDate,
      income: totalIncome,
      expenses: totalExpenses,
      profit
    });
  } catch (error) {
    console.error('Error generating weekly report:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Monthly Report
router.get('/monthly', authenticate, async (req, res) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month are required' });
    }

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

    const income = await db.query(`
      SELECT COALESCE(SUM(total), 0) as total
      FROM transactions
      WHERE date >= ? AND date <= ?
    `, [startDate, endDate]);

    const expenses = await db.query(`
      SELECT category, COALESCE(SUM(amount), 0) as total
      FROM expenses
      WHERE date >= ? AND date <= ?
      GROUP BY category
    `, [startDate, endDate]);

    const totalIncome = income[0]?.total || 0;
    const totalExpenses = expenses.reduce((sum, e) => sum + e.total, 0);
    const profit = totalIncome - totalExpenses;

    res.json({
      year,
      month,
      income: totalIncome,
      expenses: expenses,
      totalExpenses,
      profit
    });
  } catch (error) {
    console.error('Error generating monthly report:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Per Pond Report
router.get('/pond/:id', authenticate, async (req, res) => {
  try {
    const pondId = req.params.id;
    const pond = await db.get('SELECT * FROM ponds WHERE id = ?', [pondId]);
    
    if (!pond) {
      return res.status(404).json({ error: 'Pond not found' });
    }

    // Get transactions from this pond
    const transactions = await db.query(`
      SELECT COALESCE(SUM(total), 0) as total, COALESCE(SUM(weight_kg), 0) as total_weight
      FROM transactions
      WHERE pond_id = ?
    `, [pondId]);

    // Get feed usage
    const feedUsage = await db.query(`
      SELECT COALESCE(SUM(quantity_kg), 0) as total_kg
      FROM feed_usage
      WHERE pond_id = ?
    `, [pondId]);

    // Get seed cost
    const seedCost = await db.query(`
      SELECT COALESCE(SUM(price), 0) as total
      FROM seed_stocking
      WHERE pond_id = ?
    `, [pondId]);

    const income = transactions[0]?.total || 0;
    const feedCost = feedUsage[0]?.total_kg || 0; // This would need feed price calculation
    const seedCostTotal = seedCost[0]?.total || 0;
    const estimatedProfit = income - seedCostTotal; // Simplified

    res.json({
      pond,
      income,
      totalWeight: transactions[0]?.total_weight || 0,
      feedUsage: feedUsage[0]?.total_kg || 0,
      seedCost: seedCostTotal,
      estimatedProfit
    });
  } catch (error) {
    console.error('Error generating pond report:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Profit & Loss Report
router.get('/profit-loss', authenticate, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    // Income
    const income = await db.query(`
      SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
      FROM transactions
      WHERE date >= ? AND date <= ?
    `, [startDate, endDate]);

    // Expenses by category
    const expenses = await db.query(`
      SELECT category, COALESCE(SUM(amount), 0) as total, COUNT(*) as count
      FROM expenses
      WHERE date >= ? AND date <= ?
      GROUP BY category
    `, [startDate, endDate]);

    const totalIncome = income[0]?.total || 0;
    const totalExpenses = expenses.reduce((sum, e) => sum + e.total, 0);
    const profit = totalIncome - totalExpenses;

    res.json({
      startDate,
      endDate,
      income: {
        total: totalIncome,
        count: income[0]?.count || 0
      },
      expenses: expenses,
      totalExpenses,
      profit
    });
  } catch (error) {
    console.error('Error generating P&L report:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Chart Data
router.get('/charts', authenticate, async (req, res) => {
  try {
    const { type, startDate, endDate } = req.query;

    if (type === 'profit-monthly') {
      // Profit per month
      const data = await db.query(`
        SELECT 
          strftime('%Y-%m', date) as month,
          COALESCE(SUM(total), 0) as income
        FROM transactions
        WHERE date >= ? AND date <= ?
        GROUP BY strftime('%Y-%m', date)
        ORDER BY month
      `, [startDate || '2024-01-01', endDate || new Date().toISOString().split('T')[0]]);

      const expenses = await db.query(`
        SELECT 
          strftime('%Y-%m', date) as month,
          COALESCE(SUM(amount), 0) as expenses
        FROM expenses
        WHERE date >= ? AND date <= ?
        GROUP BY strftime('%Y-%m', date)
        ORDER BY month
      `, [startDate || '2024-01-01', endDate || new Date().toISOString().split('T')[0]]);

      // Combine data
      const months = [...new Set([...data.map(d => d.month), ...expenses.map(e => e.month)])].sort();
      const chartData = months.map(month => {
        const incomeData = data.find(d => d.month === month);
        const expenseData = expenses.find(e => e.month === month);
        return {
          month,
          income: incomeData?.income || 0,
          expenses: expenseData?.expenses || 0,
          profit: (incomeData?.income || 0) - (expenseData?.expenses || 0)
        };
      });

      res.json(chartData);
    } else if (type === 'income-expense') {
      // Income vs Expense comparison
      const income = await db.query(`
        SELECT COALESCE(SUM(total), 0) as total
        FROM transactions
        WHERE date >= ? AND date <= ?
      `, [startDate || '2024-01-01', endDate || new Date().toISOString().split('T')[0]]);

      const expenses = await db.query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM expenses
        WHERE date >= ? AND date <= ?
      `, [startDate || '2024-01-01', endDate || new Date().toISOString().split('T')[0]]);

      res.json({
        income: income[0]?.total || 0,
        expenses: expenses[0]?.total || 0
      });
    } else if (type === 'expense-composition') {
      // Expense composition (pie chart)
      const expenses = await db.query(`
        SELECT category, COALESCE(SUM(amount), 0) as total
        FROM expenses
        WHERE date >= ? AND date <= ?
        GROUP BY category
      `, [startDate || '2024-01-01', endDate || new Date().toISOString().split('T')[0]]);

      res.json(expenses);
    } else {
      res.status(400).json({ error: 'Invalid chart type' });
    }
  } catch (error) {
    console.error('Error generating chart data:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Download Report as Word
router.get('/download/:type', authenticate, async (req, res) => {
  try {
    const { type } = req.params;
    const { startDate, endDate, date, year, month, pondId } = req.query;

    let reportData = {};
    let title = '';

    if (type === 'daily') {
      const data = await db.query(`
        SELECT 
          COALESCE(SUM(total), 0) as income
        FROM transactions
        WHERE date = ?
      `, [date]);
      
      const expenses = await db.query(`
        SELECT category, COALESCE(SUM(amount), 0) as total
        FROM expenses
        WHERE date = ?
        GROUP BY category
      `, [date]);

      reportData = {
        date,
        income: data[0]?.income || 0,
        expenses: expenses,
        totalExpenses: expenses.reduce((sum, e) => sum + e.total, 0)
      };
      title = `Laporan Harian - ${date}`;
    } else if (type === 'profit-loss') {
      const income = await db.query(`
        SELECT COALESCE(SUM(total), 0) as total
        FROM transactions
        WHERE date >= ? AND date <= ?
      `, [startDate, endDate]);

      const expenses = await db.query(`
        SELECT category, COALESCE(SUM(amount), 0) as total
        FROM expenses
        WHERE date >= ? AND date <= ?
        GROUP BY category
      `, [startDate, endDate]);

      reportData = {
        startDate,
        endDate,
        income: income[0]?.total || 0,
        expenses: expenses,
        totalExpenses: expenses.reduce((sum, e) => sum + e.total, 0)
      };
      title = `Laporan Laba Rugi - ${startDate} s/d ${endDate}`;
    }

    // Create Word document
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: title,
                bold: true,
                size: 32
              })
            ],
            spacing: { after: 400 }
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Pemasukan: ${formatCurrency(reportData.income)}`,
                size: 24
              })
            ],
            spacing: { after: 200 }
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Pengeluaran: ${formatCurrency(reportData.totalExpenses)}`,
                size: 24
              })
            ],
            spacing: { after: 200 }
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Laba/Rugi: ${formatCurrency(reportData.income - reportData.totalExpenses)}`,
                size: 24,
                bold: true
              })
            ],
            spacing: { after: 400 }
          }),
          ...(reportData.expenses && reportData.expenses.length > 0 ? [
            new Paragraph({
              children: [
                new TextRun({
                  text: 'Rincian Pengeluaran:',
                  bold: true,
                  size: 24
                })
              ],
              spacing: { after: 200 }
            }),
            new Table({
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph('Kategori')] }),
                    new TableCell({ children: [new Paragraph('Jumlah')] })
                  ]
                }),
                ...reportData.expenses.map(exp => new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph(exp.category)] }),
                    new TableCell({ children: [new Paragraph(formatCurrency(exp.total))] })
                  ]
                }))
              ],
              width: { size: 100, type: WidthType.PERCENTAGE }
            })
          ] : [])
        ]
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${title.replace(/\s/g, '_')}.docx"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error generating Word report:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

