const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config(); 

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
// Important: For security, consider setting a specific origin instead of '*' for production.
app.use(cors()); 
app.use(express.json()); 

// MongoDB Connection
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/maruti_pharma'; 
mongoose.connect(mongoURI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Medicine Schema 
const medicineSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  strength: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0 },
  expiryDate: { type: Date, required: true } 
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

// --- API Endpoints ---

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
      // Resetting time for accurate comparison with front-end logic
      const now_midnight = new Date(now.setHours(0,0,0,0)); 
      
      if (filter === 'expired') query.expiryDate = { $lt: now_midnight };
      else if (filter === 'soon') query.expiryDate = { $gte: now_midnight, $lte: new Date(now_midnight.getTime() + 30 * 24 * 60 * 60 * 1000) };
      else if (filter === 'near') query.expiryDate = { $gte: now_midnight, $lte: new Date(now_midnight.getTime() + 90 * 24 * 60 * 60 * 1000) };
      else if (filter === 'ok') query.expiryDate = { $gt: new Date(now_midnight.getTime() + 90 * 24 * 60 * 60 * 1000) };
    }

    // Retrieve only necessary fields
    const medicines = await Medicine.find(query, 'name strength quantity expiryDate'); 
    
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

// POST /api/inventory - Add new medicine 
app.post('/api/inventory', async (req, res) => {
  try {
    const { name, strength, quantity, expiryDate } = req.body;
    if (!name || !strength || quantity == null || !expiryDate) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    // Check if medicine already exists
    const existingMed = await Medicine.findOne({ name });
    if (existingMed) {
        return res.status(400).json({ error: 'Medicine with this name already exists.' });
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
    
    // Ensure quantity is handled as a number
    med.quantity -= Number(quantity); 
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
