const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config(); // For environment variables (e.g., MongoDB URI)

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Allow cross-origin requests from your front-end
app.use(express.json()); // Parse JSON bodies

// MongoDB Connection
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/maruti_pharma'; // Use env var for production
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Medicine Schema (matches your data structure)
const medicineSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  strength: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0 },
  expiryDate: { type: Date, required: true } // Note: Changed to Date type for better querying
});

const Medicine = mongoose.model('Medicine', medicineSchema);

// Helper: Calculate status (mirrors your front-end logic)
const getStatus = (expiryDate) => {
  const days = Math.floor((new Date(expiryDate).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000);
  if (days < 0) return { key: 'expired', label: 'Expired' };
  if (days <= 30) return { key: 'soon', label: '≤30d' };
  if (days <= 90) return { key: 'near', label: '≤90d' };
  return { key: 'ok', label: 'OK' };
};

// API Endpoints

// GET /api/inventory - Fetch all medicines (with optional search/filter)
app.get('/api/inventory', async (req, res) => {
  try {
    const { search, filter } = req.query;
    let query = {};

    // Search by name or strength
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { strength: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by status
    if (filter && filter !== 'all') {
      const now = new Date();
      if (filter === 'expired') query.expiryDate = { $lt: now };
      else if (filter === 'soon') query.expiryDate = { $gte: now, $lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) };
      else if (filter === 'near') query.expiryDate = { $gte: now, $lte: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000) };
      else if (filter === 'ok') query.expiryDate = { $gt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000) };
    }

    const medicines = await Medicine.find(query);
    const items = medicines.map(med => ({
      name: med.name,
      strength: med.strength,
      quantity: med.quantity,
      'expiry-date': med.expiryDate.toISOString().split('T')[0], // Format as YYYY-MM-DD
      status: getStatus(med.expiryDate)
    }));

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory - Add new medicine (for add-stock.html integration)
app.post('/api/inventory', async (req, res) => {
  try {
    const { name, strength, quantity, expiryDate } = req.body;
    if (!name || !strength || quantity == null || !expiryDate) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const newMed = new Medicine({ name, strength, quantity, expiryDate: new Date(expiryDate) });
    await newMed.save();
    res.status(201).json({ message: 'Medicine added successfully' });
  } catch (err) {
    if (err.code === 11000) res.status(400).json({ error: 'Medicine name must be unique' });
    else res.status(500).json({ error: err.message });
  }
});

// DELETE /api/inventory/:name - Delete a medicine by name
app.delete('/api/inventory/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const result = await Medicine.deleteOne({ name });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Medicine not found' });
    res.json({ message: 'Medicine deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sales - Record a sale (update quantity)
app.post('/api/sales', async (req, res) => {
  try {
    const { medicine, quantity } = req.body;
    if (!medicine || quantity <= 0) {
      return res.status(400).json({ error: 'Valid medicine and quantity required' });
    }
    const med = await Medicine.findOne({ name: medicine });
    if (!med) return res.status(404).json({ error: 'Medicine not found' });
    if (med.quantity < quantity) return res.status(400).json({ error: 'Insufficient stock' });
    med.quantity -= quantity;
    await med.save();
    res.json({ message: `Sale of ${quantity} units of ${medicine} recorded` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
